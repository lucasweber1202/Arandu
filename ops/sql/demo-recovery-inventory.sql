-- Inventário SOMENTE LEITURA para a política de recuperação da Demo
-- (lib/demo-recovery-policy.mjs). Só contagens e identificadores técnicos de
-- workspace; nunca e-mail, nome, conteúdo de linha ou objeto.
-- :domains = JSON array dos domínios fictícios (lib/finance/demo-guard.mjs).
begin read only;
select json_build_object(
  'deployment_environment', (select value from public.fin_settings where key = 'deployment_environment'),
  'schema_version', (select value from public.fin_settings where key = 'schema_version'),
  'postgres_major', current_setting('server_version_num')::int / 10000,
  'users', (
    with u as (
      select lower(split_part(email, '@', 2)) dom, email ~ '^[^@+]+\+ws-[a-f0-9]{10}@' ws from auth.users
    )
    select json_build_object(
      'total', count(*),
      'fictitious', count(*) filter (where dom in (select jsonb_array_elements_text(:'domains'::jsonb))),
      'workspace_accounts', count(*) filter (where ws and dom in (select jsonb_array_elements_text(:'domains'::jsonb))),
      'unclassified', count(*) filter (where dom is null or dom = '' or dom not in (select jsonb_array_elements_text(:'domains'::jsonb))))
    from u),
  'auth', json_build_object(
    'non_email_identities', (select count(*) from auth.identities where provider <> 'email'),
    'mfa_factors', (select count(*) from auth.mfa_factors),
    'sso_providers', (select count(*) from auth.sso_providers)),
  'organizations', (
    with m as (
      select o.id, bool_and(lower(split_part(u.email, '@', 2)) in (select jsonb_array_elements_text(:'domains'::jsonb))) all_fictitious
      from public.fin_organizations o left join public.fin_members mb on mb.organization_id = o.id left join auth.users u on u.id = coalesce(mb.user_id, o.created_by)
      group by o.id)
    select json_build_object('total', count(*), 'fictitious', count(*) filter (where all_fictitious), 'unclassified', count(*) filter (where all_fictitious is not true)) from m),
  'workspaces', (
    select json_build_object(
      'by_status', coalesce((select json_object_agg(status, n) from (select status, count(*) n from public.fin_demo_workspaces group by status) s), '{}'::json),
      'claimed_valid', count(*) filter (where status = 'claimed' and expires_at > now() and idle_expires_at > now()),
      'claimed_valid_next_expiry', min(least(expires_at, idle_expires_at)) filter (where status = 'claimed' and expires_at > now() and idle_expires_at > now()),
      'provisioning', count(*) filter (where status = 'provisioning'))
    from public.fin_demo_workspaces),
  -- Estado que o seed não regenera: o que visitantes com sessão válida criaram.
  'visitor_state', (
    with live as (
      select unnest(array[w.buyer_organization_id] || w.provider_organization_ids) org from public.fin_demo_workspaces w
      where w.status = 'claimed' and w.expires_at > now() and w.idle_expires_at > now()
    )
    select json_build_object(
      'organizations', (select count(distinct org) from live where org is not null),
      'events_after_claim', (select count(*) from public.fin_events e join public.fin_demo_workspaces w on e.organization_id = w.buyer_organization_id
                             where w.status = 'claimed' and w.expires_at > now() and w.idle_expires_at > now() and e.happened_at > w.claimed_at))),
  'storage', json_build_object(
    'objects', (select count(*) from storage.objects),
    'buckets', (select count(*) from storage.buckets),
    'public_buckets', (select count(*) from storage.buckets where public),
    'objects_outside_fictitious_orgs', (
      select count(*) from storage.objects ob
      where not exists (
        select 1 from public.fin_organizations o join auth.users u on u.id = o.created_by
        where ob.name like o.id::text || '/%' and lower(split_part(u.email, '@', 2)) in (select jsonb_array_elements_text(:'domains'::jsonb))))),
  'pool_lease', (select json_build_object('held', count(*) > 0, 'expires_at', max(expires_at)) from public.fin_demo_pool_leases where expires_at > now())
);
rollback;

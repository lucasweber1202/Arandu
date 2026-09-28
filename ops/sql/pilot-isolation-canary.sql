-- Canário de isolamento entre tenants, somente leitura, para o banco do piloto
-- (ou um restore dele). Para CADA membro real de fin_members, e para uma conta
-- externa sintética, assume o papel `authenticated` com o `sub` da pessoa e
-- confere que o RLS só devolve linhas das organizações dela (ou de RFQs para as
-- quais a organização provedora dela aceitou convite). Qualquer linha fora
-- disso é vazamento e aborta com erro. Tudo roda numa transação desfeita no
-- fim: nada é gravado. A saída tem só contagens — nenhum e-mail, nome ou termo.
--
--   psql "$PILOT_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f ops/sql/pilot-isolation-canary.sql
begin;
create temporary table canary_expected on commit drop as
  select m.user_id,
         array_agg(distinct m.organization_id) as orgs,
         coalesce((select array_agg(distinct i.rfq_id) from public.fin_rfq_invites i
                    where i.status = 'accepted' and i.provider_organization_id in
                      (select organization_id from public.fin_members x where x.user_id = m.user_id)), '{}') as invited_rfqs
    from public.fin_members m group by m.user_id
  union all
  select '00000000-0000-4000-8000-00000000c0de'::uuid, '{}'::uuid[], '{}'::uuid[];
grant select on canary_expected to authenticated;

do $$
declare
  p record; v_leaks text := ''; v_count bigint; v_people integer := 0; v_checks integer := 0;
  v_tbl text; v_rule text;
begin
  for p in select * from canary_expected loop
    v_people := v_people + 1;
    perform set_config('request.jwt.claim.sub', p.user_id::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', p.user_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    execute 'set local role authenticated';
    for v_tbl, v_rule in select * from (values
      ('fin_organizations',      'not (id = any($1))'),
      ('fin_members',            'not (organization_id = any($1))'),
      ('fin_events',             'not (organization_id = any($1))'),
      ('fin_decisions',          'not (organization_id = any($1))'),
      ('fin_contracts',          'not (organization_id = any($1))'),
      ('fin_tasks',              'not (organization_id = any($1))'),
      ('fin_approval_requests',  'not (organization_id = any($1))'),
      ('fin_providers',          'not (organization_id = any($1))'),
      ('fin_company_profiles',   'not (organization_id = any($1))'),
      ('fin_renewal_milestones', 'not (organization_id = any($1))'),
      ('fin_rfq_revisions',      'not (organization_id = any($1) or rfq_id = any($2))'),
      ('fin_rfqs',               'not (organization_id = any($1) or id = any($2))'),
      ('fin_proposals',          'not (buyer_organization_id = any($1) or provider_organization_id = any($1))'),
      ('fin_rfq_invites',        'not (buyer_organization_id = any($1) or provider_organization_id = any($1))'),
      ('fin_proposal_drafts',    'not (provider_organization_id = any($1))'),
      ('fin_notifications',      'user_id <> $3'),
      ('fin_private_documents',  'not (organization_id = any($1) or buyer_organization_id = any($1) or (visibility = ''shared'' and rfq_id = any($2)))')
    ) t(tbl, rule) loop
      execute format('select count(*) from public.%I where %s', v_tbl, v_rule) into v_count using p.orgs, p.invited_rfqs, p.user_id;
      v_checks := v_checks + 1;
      if v_count > 0 then v_leaks := v_leaks || format('pessoa#%s:%s=%s; ', v_people, v_tbl, v_count); end if;
    end loop;
    -- Tabelas que nenhuma conta cliente pode ler.
    foreach v_tbl in array array['fin_pilot_allowlist','fin_settings','fin_platform_operators','fin_invite_acceptance_denials',
                                 'fin_job_runs','fin_ops_access_log','fin_member_invitations'] loop
      begin
        execute format('select count(*) from public.%I', v_tbl) into v_count;
        v_checks := v_checks + 1;
        if v_count > 0 then v_leaks := v_leaks || format('pessoa#%s:%s=%s; ', v_people, v_tbl, v_count); end if;
      exception when insufficient_privilege then v_checks := v_checks + 1;
      end;
    end loop;
    execute 'reset role';
  end loop;
  if v_leaks <> '' then raise exception 'CANÁRIO: vazamento entre tenants: %', v_leaks; end if;
  raise notice 'CANÁRIO OK: % pessoas (inclui 1 externa sintética), % verificações, 0 vazamentos', v_people, v_checks;
end $$;
rollback;

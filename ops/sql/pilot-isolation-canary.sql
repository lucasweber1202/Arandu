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
  v_tbl text; v_rule text; v_schema text; v_passport boolean; v_multi boolean; v_contracts boolean; v_order integer; r record;
begin
  select value into v_schema from public.fin_settings where key='schema_version';
  -- Marcadores suportados, em ordem de aplicação: cada tabela nova é exigida a
  -- partir do marcador que a cria.
  v_order := array_position(array['financial-surface-hardening-1','financial-approval-handoff-1','financial-passport-1',
                                   'financial-multi-entity-1','financial-contracts-v2-1',
                                   'financial-relationships-portfolio-1','financial-passport-entities-1'], v_schema);
  if v_order is null then
    raise exception 'CANÁRIO: schema não suportado';
  end if;
  v_passport := v_order >= 3;
  v_multi := v_order >= 4;
  v_contracts := v_order >= 5;
  if (to_regclass('public.fin_facilities') is not null) <> (v_order >= 6) then
    raise exception 'CANÁRIO: schema_version e tabelas de financial-relationships-portfolio-1 divergentes';
  end if;
  if (to_regclass('public.fin_contract_versions') is not null) <> v_contracts then
    raise exception 'CANÁRIO: schema_version e tabelas do Contract Center divergentes';
  end if;
  if (to_regclass('public.fin_legal_entities') is not null) <> v_multi then
    raise exception 'CANÁRIO: schema_version e tabelas multi-entity divergentes';
  end if;
  if (to_regclass('public.fin_company_profile_history') is not null) <> v_passport
     or (to_regclass('public.fin_rfq_profile_snapshots') is not null) <> v_passport then
    raise exception 'CANÁRIO: schema_version e tabelas Passport divergentes';
  end if;
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
      ('fin_company_profile_history', 'not (organization_id = any($1))'),
      ('fin_rfq_profile_snapshots', 'not (organization_id = any($1))'),
      ('fin_renewal_milestones', 'not (organization_id = any($1))'),
      ('fin_rfq_revisions',      'not (organization_id = any($1) or rfq_id = any($2))'),
      ('fin_rfqs',               'not (organization_id = any($1) or id = any($2))'),
      ('fin_proposals',          'not (buyer_organization_id = any($1) or provider_organization_id = any($1))'),
      ('fin_rfq_invites',        'not (buyer_organization_id = any($1) or provider_organization_id = any($1))'),
      ('fin_proposal_drafts',    'not (provider_organization_id = any($1))'),
      ('fin_notifications',      'user_id <> $3'),
      ('fin_legal_entities',     'not (organization_id = any($1))'),
      ('fin_contract_versions',  'not (organization_id = any($1))'),
      ('fin_contract_amendments', 'not (organization_id = any($1))'),
      ('fin_contract_milestones', 'not (organization_id = any($1))'),
      ('fin_member_entity_grants', 'not (organization_id = any($1))'),
      ('fin_facilities', 'not (organization_id = any($1))'),
      ('fin_facility_balances', 'not (organization_id = any($1))'),
      ('fin_guarantees', 'not (organization_id = any($1))'),
      ('fin_provider_issues', 'not (organization_id = any($1))'),
      ('fin_provider_relationships', 'not (organization_id = any($1))'),
      ('fin_provider_reviews', 'not (organization_id = any($1))'),
      ('fin_provider_contacts', 'not (organization_id = any($1))'),
      ('fin_private_documents',  'not (organization_id = any($1) or buyer_organization_id = any($1) or (visibility = ''shared'' and rfq_id = any($2)))')
    ) t(tbl, rule) loop
      -- Before Passport, these two tables must be absent (checked above).
      -- From financial-passport-1 on every check is mandatory, including both.
      if not v_passport and v_tbl in ('fin_company_profile_history','fin_rfq_profile_snapshots') then continue; end if;
      if not v_multi and v_tbl in ('fin_legal_entities','fin_member_entity_grants') then continue; end if;
      if v_order < 6 and v_tbl in ('fin_facilities','fin_facility_balances','fin_guarantees','fin_provider_issues','fin_provider_relationships','fin_provider_reviews','fin_provider_contacts') then continue; end if;
      if not v_contracts and v_tbl in ('fin_contract_versions','fin_contract_amendments','fin_contract_milestones') then continue; end if;
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
  -- Multi-entity: membro com escopo restrito só lê, na organização em que é
  -- restrito, RFQs/contratos/eventos/tarefas das entidades concedidas (ou das
  -- unidades abaixo delas). Linhas sem entidade são de nível de grupo.
  if v_multi then
    for r in select m.user_id, m.organization_id,
                    coalesce((select array_agg(e.id) from public.fin_member_entity_grants g
                               join public.fin_legal_entities e on e.organization_id = g.organization_id and (e.id = g.entity_id or e.parent_id = g.entity_id)
                              where g.organization_id = m.organization_id and g.user_id = m.user_id), '{}') as entities
               from public.fin_members m where m.entity_scope = 'entities' loop
      v_people := v_people + 1;
      perform set_config('request.jwt.claim.sub', r.user_id::text, true);
      perform set_config('request.jwt.claims', json_build_object('sub', r.user_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
      execute 'set local role authenticated';
      foreach v_tbl in array array['fin_rfqs','fin_contracts','fin_events','fin_legal_entities']
          || case when v_order >= 6 then array['fin_facilities','fin_guarantees','fin_provider_relationships'] else '{}'::text[] end loop
        execute format('select count(*) from public.%I where organization_id = $1 and not (coalesce(%s, ''00000000-0000-0000-0000-000000000000''::uuid) = any($2))',
                       v_tbl, case when v_tbl = 'fin_legal_entities' then 'id' else 'legal_entity_id' end)
          into v_count using r.organization_id, r.entities;
        v_checks := v_checks + 1;
        if v_count > 0 then v_leaks := v_leaks || format('restrito#%s:%s=%s; ', v_people, v_tbl, v_count); end if;
      end loop;
      select count(*) into v_count from public.fin_tasks t where t.organization_id = r.organization_id
        and not (coalesce(t.legal_entity_id, '00000000-0000-0000-0000-000000000000'::uuid) = any(r.entities))
        and not (t.related_type is null and t.created_by = r.user_id);
      v_checks := v_checks + 1;
      if v_count > 0 then v_leaks := v_leaks || format('restrito#%s:fin_tasks=%s; ', v_people, v_count); end if;
      execute 'reset role';
    end loop;
  end if;
  if v_leaks <> '' then raise exception 'CANÁRIO: vazamento entre tenants: %', v_leaks; end if;
  raise notice 'CANÁRIO OK: schema %, % pessoas (inclui 1 externa sintética), % verificações, 0 vazamentos', v_schema, v_people, v_checks;
end $$;
rollback;

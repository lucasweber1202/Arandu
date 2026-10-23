\set ON_ERROR_STOP on

-- External ingestion marker requires its real policies and narrowly granted RPCs.
do $$ declare t text; begin
 if (select value from public.fin_settings where key='schema_version') in ('financial-external-proposals-1', 'financial-relationship-continuity-1') then
  foreach t in array array['fin_external_proposals','fin_external_proposal_versions','fin_external_proposal_reviews'] loop
   if not exists(select 1 from pg_class where oid=to_regclass('public.'||t) and relrowsecurity and relforcerowsecurity)
    or has_table_privilege('authenticated','public.'||t,'INSERT,UPDATE,DELETE') then raise exception 'external proposal table grants unsafe'; end if;
  end loop;
  if not has_function_privilege('authenticated','public.fin_external_proposal_save(uuid,uuid,text,integer,uuid,jsonb)','EXECUTE')
   or not has_function_privilege('authenticated','public.fin_external_proposal_review(uuid,integer,text,text,boolean,boolean)','EXECUTE')
   or has_function_privilege('anon','public.fin_external_proposal_save(uuid,uuid,text,integer,uuid,jsonb)','EXECUTE')
   or has_function_privilege('authenticated','public.fin_external_require_actor(uuid,uuid,text[])','EXECUTE') then raise exception 'external proposal function grants unsafe'; end if;
  if not exists(select 1 from pg_class where oid=to_regclass('public.fin_external_proposal_current') and 'security_invoker=true'=any(reloptions)) then raise exception 'external proposal view unsafe'; end if;
 end if;
end $$;


-- v3.4: require the effective grants and write guard, not just the marker.
do $$ begin
  if (select value from public.fin_settings where key='schema_version') in ('financial-enterprise-integrity-1','financial-decision-authorization-1', 'financial-external-proposals-1', 'financial-relationship-continuity-1') then
    if has_function_privilege('authenticated','public.fin_record_decision(uuid,uuid,jsonb,text)','EXECUTE')
      or has_function_privilege('anon','public.fin_record_decision(uuid,uuid,jsonb,text)','EXECUTE')
      or has_function_privilege('service_role','public.fin_record_decision(uuid,uuid,jsonb,text)','EXECUTE')
      or not has_function_privilege('authenticated','public.fin_record_decision_v2(uuid,uuid,integer,jsonb,text)','EXECUTE') then
      raise exception 'decision entry point grants unsafe';
    end if;
    if not exists(select 1 from pg_trigger where tgrelid='public.fin_approval_steps'::regclass
      and tgname='fin_approval_steps_live_actor' and tgenabled='O') then raise exception 'approval live actor guard unavailable'; end if;
    if to_regprocedure('public.fin_assignment_buyer_names(uuid,uuid[])') is null then raise exception 'assignment buyer identity unavailable'; end if;
    if (select value from public.fin_settings where key='schema_version') in ('financial-decision-authorization-1', 'financial-external-proposals-1', 'financial-relationship-continuity-1') then
      if not exists(select 1 from pg_trigger where tgrelid='public.fin_decisions'::regclass
        and tgname='fin_decisions_live_actor' and tgenabled='O') then raise exception 'decision live actor guard unavailable'; end if;
      if has_function_privilege('authenticated','public.fin_decision_live_actor_guard()','EXECUTE')
        or has_function_privilege('anon','public.fin_decision_live_actor_guard()','EXECUTE')
        or has_function_privilege('service_role','public.fin_decision_live_actor_guard()','EXECUTE') then raise exception 'decision trigger function exposed'; end if;
    end if;
  end if;
end $$;
-- Probes depois de aplicar migrations (release-migrations): superfície do
-- produto financeiro, sem tocar dado. Rodam numa transação desfeita.
begin;

do $$
declare v_unforced text; v_anon text;
begin
  if to_regclass('public.fin_organizations') is null or to_regclass('public.fin_members') is null or to_regclass('public.fin_events') is null then
    raise exception 'Tabelas financeiras obrigatórias ausentes depois da migration.';
  end if;

  select string_agg(c.relname, ', ' order by c.relname) into v_unforced
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'fin\_%' and not c.relrowsecurity;
  if v_unforced is not null then raise exception 'Tabela financeira sem RLS: %', v_unforced; end if;

  select string_agg(c.relname, ', ' order by c.relname) into v_anon
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','v','m') and c.relname like 'fin\_%' and has_table_privilege('anon', c.oid, 'SELECT');
  if v_anon is not null then raise exception 'Tabela financeira visível para anon: %', v_anon; end if;

  -- Superfície do catálogo inteiro, não só de funções conhecidas: security
  -- definer sem search_path fixo é sombreável; executável por anon atravessa o
  -- RLS sem sessão. Tabela/view de public não concede nada a anon. Objetos de
  -- extensão ficam fora (não são migrations do Arandu).
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%');
  if v_anon is not null then raise exception 'Função security definer sem search_path fixo: %', v_anon; end if;

  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')
     and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e');
  if v_anon is not null then raise exception 'Função security definer executável por anon: %', v_anon; end if;

  select string_agg(c.relname, ', ' order by c.relname) into v_anon
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','v','m','p')
     and has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
  if v_anon is not null then raise exception 'Tabela ou view de public com privilégio para anon: %', v_anon; end if;

  if to_regclass('public.transactional_email_outbox') is null
     or not has_function_privilege('service_role', 'public.consume_rate_limit(text,text,integer,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.consume_rate_limit(text,text,integer,integer)', 'EXECUTE') then
    raise exception 'Infraestrutura compartilhada (outbox/rate limit) ausente ou exposta.';
  end if;

  -- Revogação de sessão (R1): com a função presente, o PostgREST precisa chamá-la
  -- em toda requisição; função sem registro no authenticator não protege nada.
  if to_regprocedure('public.fin_request_session_guard()') is not null
     and exists (select 1 from pg_roles where rolname = 'authenticator')
     and not exists (select 1 from pg_roles r, unnest(coalesce(r.rolconfig, '{}'::text[])) c
                      where r.rolname = 'authenticator' and c = 'pgrst.db_pre_request=public.fin_request_session_guard') then
    raise exception 'Revogação de sessão instalada, mas não registrada no PostgREST (pgrst.db_pre_request).';
  end if;

  -- O marker de upload exige helper privado e as RPCs compatíveis, com owner
  -- comum: a RPC não pode delegar autorização a função de outro principal.
  if (select value from public.fin_settings where key='schema_version') in ('financial-document-upload-authorization-1','financial-implementation-task-labels-1', 'financial-task-accountability-1', 'financial-enterprise-integrity-1', 'financial-decision-authorization-1', 'financial-external-proposals-1', 'financial-relationship-continuity-1') then
    if to_regprocedure('public.fin_document_lock_upload_authorization(uuid,uuid)') is null
       or to_regprocedure('public.fin_document_pending_upload(uuid,integer)') is null
       or to_regprocedure('public.fin_document_finalize_upload(uuid,integer,bigint,text)') is null then
      raise exception 'Autorização de upload incompleta.';
    end if;
    if exists(select 1 from pg_proc p where p.oid in (
        'public.fin_document_lock_upload_authorization(uuid,uuid)'::regprocedure,
        'public.fin_document_pending_upload(uuid,integer)'::regprocedure,
        'public.fin_document_finalize_upload(uuid,integer,bigint,text)'::regprocedure)
       and (not p.prosecdef or p.provolatile<>'v'
          or p.proowner<>(select proowner from pg_proc where oid='public.fin_document_finalize_upload(uuid,integer,bigint,text)'::regprocedure)))
       or has_function_privilege('anon','public.fin_document_lock_upload_authorization(uuid,uuid)','EXECUTE')
       or has_function_privilege('authenticated','public.fin_document_lock_upload_authorization(uuid,uuid)','EXECUTE')
       or has_function_privilege('service_role','public.fin_document_lock_upload_authorization(uuid,uuid)','EXECUTE')
       or not has_function_privilege('authenticated','public.fin_document_pending_upload(uuid,integer)','EXECUTE')
       or has_function_privilege('authenticated','public.fin_document_finalize_upload(uuid,integer,bigint,text)','EXECUTE')
       or not has_function_privilege('service_role','public.fin_document_finalize_upload(uuid,integer,bigint,text)','EXECUTE') then
      raise exception 'Owner, autorização ou grants das RPCs de upload inválidos.';
    end if;
  end if;

  -- Depois da aposentadoria, a vertical de arte não pode reaparecer no schema.
  if coalesce((select value from public.fin_settings where key = 'schema_version'), '') in ('financial-legacy-art-decommission-1','financial-p0-closure-1','financial-value-realization-1','financial-fee-intelligence-1','financial-opportunity-engine-1','financial-document-intelligence-1','financial-provider-qualification-1','financial-implementation-1','financial-covenants-1','financial-provider-performance-1','financial-spend-intelligence-1','financial-opportunity-discriminator-1','financial-demo-workspaces-1','financial-demo-pool-1', 'financial-security-closure-1', 'financial-request-receipts-1', 'financial-followup-hardening-1', 'financial-contract-onboarding-1', 'financial-renewal-cycles-1', 'financial-decision-integrity-1', 'financial-session-revocation-1', 'financial-document-upload-authorization-1', 'financial-implementation-task-labels-1', 'financial-task-accountability-1', 'financial-enterprise-integrity-1', 'financial-decision-authorization-1', 'financial-external-proposals-1', 'financial-relationship-continuity-1')
     and (to_regclass('public.artworks') is not null or to_regclass('public.reservations') is not null or to_regclass('public.profiles') is not null) then
    raise exception 'Objetos da vertical de arte presentes depois da aposentadoria.';
  end if;
end;
$$;

rollback;

-- Check the read projection without weakening the existing probes.
do $$ begin
 if (select value from public.fin_settings where key='schema_version')='financial-relationship-continuity-1' then
  if not exists(select 1 from pg_class where oid=to_regclass('public.fin_provider_contract_tasks') and 'security_invoker=true'=any(reloptions))
    or not has_table_privilege('authenticated','public.fin_provider_contract_tasks','SELECT')
    or has_table_privilege('authenticated','public.fin_provider_contract_tasks','INSERT,UPDATE,DELETE')
    or has_table_privilege('anon','public.fin_provider_contract_tasks','SELECT') then raise exception 'relationship projection unsafe'; end if;
 end if;
end $$;

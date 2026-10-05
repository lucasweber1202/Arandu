\set ON_ERROR_STOP on
-- Superfície exposta ao PostgREST (docs/supabase-financial-pilot-surface-hardening.sql)
-- e matriz adversarial entre tenants. O bootstrap reproduz os default privileges
-- do Supabase, então o que passa aqui é o que o cliente alcança lá.

-- 1. Inventário: toda função executável pelo cliente foi revisada. Função nova
--    exposta a authenticated/anon quebra este teste até entrar na lista.
do $$
declare v_extra text; v_missing text;
begin
  with expected_base(sig) as (values
    ('fin_accept_member_invitation(text)'),('fin_accept_provider_invite(text,uuid)'),('fin_accept_terms(uuid,text,text)'),
    ('fin_act_on_approval(uuid,text,text)'),('fin_add_comment(text,uuid,text,text,uuid[],uuid)'),('fin_can_read_document(uuid)'),
    ('fin_cancel_approval(uuid)'),('fin_clear_rfq_editor(uuid,integer)'),('fin_comment_authors(text,uuid)'),
    ('fin_create_organization(text,text,text)'),('fin_create_rfq(uuid,text,text,text,jsonb,date)'),
    ('fin_document_authorize_download(uuid,integer)'),('fin_document_begin_upload(uuid,text,uuid,text,text,text,bigint,text,uuid)'),
    ('fin_document_mime_allowed(text)'),('fin_document_pending_upload(uuid,integer)'),('fin_document_remove(uuid)'),
    ('fin_has_role(uuid,text[])'),('fin_invite_member(uuid,text,text)'),('fin_invite_provider(uuid,uuid)'),('fin_is_operator()'),
    ('fin_jwt_aal()'),('fin_mark_notifications(uuid,uuid[])'),('fin_ops_overview()'),('fin_ops_trace(text,uuid)'),
    ('fin_platform_role()'),('fin_process_renewals(uuid,date)'),('fin_provider_can_comment(text,uuid)'),
    ('fin_provider_reads_comment(uuid,uuid,text,uuid)'),('fin_record_client_event(uuid,text,uuid,text)'),
    ('fin_record_decision(uuid,uuid,jsonb,text)'),('fin_record_provider_evidence(uuid,text,text,text,date)'),
    ('fin_register_contract(uuid,date,date,integer,text,text,text)'),('fin_reply_comment(uuid,text,uuid[],uuid)'),
    ('fin_request_approval(uuid,uuid,uuid[],text)'),('fin_revise_rfq(uuid,integer,text,text,jsonb,date)'),
    ('fin_save_proposal_draft(uuid,jsonb,integer,integer)'),('fin_save_rfq_editor(uuid,jsonb,integer)'),
    ('fin_search(uuid,text,text,integer,integer)'),('fin_set_approval_policy(uuid,boolean)'),
    ('fin_set_notification_preference(uuid,text,boolean,boolean)'),('fin_start_contract_rfq(uuid)'),
    ('fin_submit_proposal(uuid,jsonb,text)'),('fin_transition(text,uuid,text)'),('fin_update_my_member_profile(uuid,text,text)'),
    ('fin_update_organization(uuid,text,text,text,text)'),('fin_withdraw_proposal(uuid)'),
    ('fin_passport_set_field(uuid,text,text,text,uuid,date,integer)'),('fin_passport_confirm_field(uuid,text)'),
    ('fin_create_rfq_from_passport(uuid,text,text,text,jsonb,date,jsonb)'),
    -- Passport entity-aware: role/entity guard, RLS predicate and invoker search.
    ('fin_passport_set_scoped_field(uuid,uuid,text,text,text,uuid,date,integer)'),
    ('fin_passport_confirm_scoped_field(uuid,uuid,text)'),('fin_passport_visible(uuid,uuid,text)'),
    ('fin_search_passport(uuid,uuid,text,integer,integer)'),
    ('fin_query_graph(uuid,text,uuid,text,uuid,text,text,date,integer,integer)'),
    -- Policy & Approval Engine v2: administração (admin), prévia sob RLS da RFQ,
    -- pedido/voto/exceção/delegação com SoD e prazos (docs/FINANCIAL_POLICY_ENGINE.md).
    ('fin_save_policy_draft(uuid,uuid,text,jsonb,text)'),('fin_activate_policy_version(uuid)'),('fin_discard_policy_draft(uuid)'),
    ('fin_retire_policy(uuid)'),('fin_set_policy_flag(uuid,text,text,text,boolean)'),('fin_preview_approval_policy(uuid,uuid,jsonb)'),
    ('fin_simulate_policy_version(uuid,jsonb)'),('fin_request_policy_approval(uuid,uuid,jsonb,text,text,jsonb)'),
    ('fin_act_on_approval_v2(uuid,text,text,text)'),('fin_supersede_approval(uuid,text)'),
    ('fin_request_policy_exception(uuid,uuid,text,text,text,jsonb)'),('fin_decide_policy_exception(uuid,text,text)'),('fin_cancel_policy_exception(uuid)'),
    ('fin_set_approval_delegation(uuid,uuid,timestamp with time zone,timestamp with time zone,text)'),('fin_revoke_approval_delegation(uuid)'),
    ('fin_process_approval_deadlines(uuid)'),
    -- Public API v1 & Webhooks: só administração humana (admin). A superfície de
    -- máquina (fin_api_*, worker) é exclusiva do service role.
    ('fin_create_service_account(uuid,text,text,text[],text,uuid[])'),('fin_update_service_account(uuid,text[],text,uuid[],text)'),
    ('fin_revoke_service_account(uuid)'),('fin_issue_api_credential(uuid,text,text,timestamp with time zone)'),('fin_revoke_api_credential(uuid)'),
    ('fin_create_webhook_endpoint(uuid,text,text[],text,text,uuid[])'),('fin_set_webhook_status(uuid,boolean)'),('fin_replay_webhook_delivery(uuid)'),
    -- Enterprise SSO: só administração humana (admin). Descoberta, autorização,
    -- validade de sessão e trilha são exclusivas do service role.
    ('fin_sso_save_connection(uuid,uuid,text,text,text,text,text,text,text,jsonb,integer)'),('fin_sso_claim_domain(uuid,text,text)'),
    ('fin_sso_link_domain(text,uuid)'),('fin_sso_set_status(uuid,text,boolean)'),('fin_sso_revoke_sessions(uuid)'),
    -- Multi-entity: RPCs de administração e auxiliares de policy (só dizem
    -- se o próprio chamador alcança uma entidade/objeto).
    ('fin_create_legal_entity(uuid,text,text,text,text,text,text,uuid)'),('fin_update_legal_entity(uuid,text,text,text,text)'),
    ('fin_set_base_currency(uuid,text)'),('fin_set_member_entity_scope(uuid,uuid,text,uuid[])'),
    ('fin_create_rfq_in_entity(uuid,uuid,text,text,text,jsonb,date,jsonb)'),('fin_set_rfq_entity(uuid,uuid)'),
    ('fin_assign_contract_entity(uuid,uuid)'),('fin_entity_scope(uuid)'),('fin_entity_allows(uuid,uuid,text[])'),
    ('fin_entity_visible(uuid,uuid)'),('fin_object_visible(uuid,text,uuid)'),('fin_rfq_visible(uuid)'),('fin_contract_visible(uuid)'),
    -- Contract Center v2.
    ('fin_import_contract(uuid,uuid,uuid,text,text,date,date,integer,boolean,text,jsonb,uuid)'),
    ('fin_record_contract_terms(uuid,jsonb,integer,text,date)'),
    ('fin_record_contract_amendment(uuid,text,date,date,text,jsonb,date,integer,uuid,integer)'),
    ('fin_create_contract_milestone(uuid,text,text,date,integer,text,date,uuid)'),
    ('fin_settle_contract_milestone(uuid,text)'),('fin_process_contract_milestones(uuid,date)'),
    ('fin_add_provider_contact(uuid,uuid,text,text,text,text,uuid,boolean)'),('fin_archive_provider_contact(uuid)'),('fin_set_provider_relationship(uuid,uuid,uuid,text,uuid,text[],date,text)'),('fin_open_provider_issue(uuid,uuid,text,text,text,text,uuid,uuid,date,uuid)'),('fin_update_provider_issue(uuid,text,text)'),('fin_create_scorecard_template(uuid,text,text,jsonb)'),('fin_record_provider_review(uuid,uuid,uuid,date,date,jsonb,uuid,text)'),('fin_save_facility(uuid,uuid,uuid,uuid,text,text,text,numeric,numeric,text,numeric,numeric,text,date,date,text,uuid,text,text,integer,text,uuid)'),('fin_confirm_facility(uuid)'),('fin_record_facility_balance(uuid,date,numeric,numeric,text,text)'),('fin_record_facility_schedule(uuid,jsonb,integer)'),('fin_save_guarantee(uuid,uuid,uuid,text,text,text,numeric,uuid,uuid,uuid,date,date,text,text)'),('fin_facility_visible(uuid)'),('fin_group_or_entity_visible(uuid,uuid)')
  ), expected as (
    select sig from expected_base
    union all
    -- Data Governance (P0.11): administração humana (admin da compradora) e,
    -- para política de plataforma, prévia e fechamento, operador finance_ops
    -- com MFA verificado dentro da função. Build, revogação e avanço do
    -- offboarding são exclusivos do service role.
    select sig from (values ('fin_retention_class_catalog()'),('fin_governance_summary(uuid)'),
      ('fin_governance_save_retention_policy(uuid,text,integer,text,text)'),('fin_governance_activate_retention_policy(uuid)'),
      ('fin_governance_retire_retention_policy(uuid)'),('fin_governance_create_legal_hold(uuid,text,uuid,text,text,text)'),
      ('fin_governance_release_legal_hold(uuid,text)'),('fin_governance_retention_run(boolean,integer,uuid,text)'),
      ('fin_governance_request_export(uuid,text)'),('fin_governance_export_manifest(uuid)'),('fin_governance_export_part(uuid,text)'),('fin_governance_export_parts(uuid)'),
      ('fin_governance_request_offboarding(uuid,text)'),('fin_governance_offboarding_action(uuid,text,jsonb)'),
      ('fin_governance_deletion_preview(uuid)'),('fin_governance_offboarding_close(uuid,text)'),('fin_governance_offboarding_operator_cancel(uuid)')
    ) g(sig) where to_regclass('public.fin_legal_holds') is not null
  ), actual as (
    select p.oid::regprocedure::text sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  )
  select (select string_agg(sig, ', ') from actual where sig not in (select sig from expected)),
         (select string_agg(sig, ', ') from expected where sig not in (select sig from actual))
    into v_extra, v_missing;
  if v_extra is not null then raise exception 'função exposta a authenticated sem revisão: %', v_extra; end if;
  if v_missing is not null then raise exception 'RPC usada pelo produto perdeu EXECUTE: %', v_missing; end if;

  select string_agg(p.oid::regprocedure::text, ', ') into v_extra from pg_proc p
   where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE')
     and p.oid::regprocedure::text not in ('fin_document_mime_allowed(text)', 'fin_jwt_aal()');
  if v_extra is not null then raise exception 'função exposta a anon: %', v_extra; end if;

  select string_agg(p.oid::regprocedure::text, ', ') into v_extra from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  if v_extra is not null then raise exception 'função com search_path mutável: %', v_extra; end if;

  select string_agg(c.relname, ', ') into v_extra from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p') and not c.relrowsecurity;
  if v_extra is not null then raise exception 'tabela sem RLS: %', v_extra; end if;

  select string_agg(c.relname, ', ') into v_extra from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
     and (has_table_privilege('anon', c.oid, 'SELECT') or (has_table_privilege('authenticated', c.oid, 'SELECT') and c.relname not in ('fin_graph_objects','fin_financial_graph'))
          or not coalesce('security_invoker=on' = any(c.reloptions) or 'security_invoker=true' = any(c.reloptions), false));
  if v_extra is not null then raise exception 'view legível pelo cliente ou sem security_invoker: %', v_extra; end if;

  select string_agg(c.relname, ', ') into v_extra from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname like 'fin\_%' and not c.relforcerowsecurity;
  if v_extra is not null then raise exception 'tabela financeira sem FORCE RLS: %', v_extra; end if;

  select string_agg(c.relname || ':' || p.privilege_type, ', ') into v_extra
    from pg_class c cross join lateral (values ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) p(privilege_type)
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname like 'fin\_%'
     and has_table_privilege('anon', c.oid, p.privilege_type);
  if v_extra is not null then raise exception 'anon com escrita em tabela financeira: %', v_extra; end if;

  if (select value from public.fin_settings where key = 'schema_version') not in ('financial-surface-hardening-1', 'financial-approval-handoff-1', 'financial-passport-1', 'financial-multi-entity-1', 'financial-contracts-v2-1', 'financial-relationships-portfolio-1', 'financial-passport-entities-1', 'financial-graph-1', 'financial-policy-engine-1', 'financial-public-api-1','financial-sso-1','financial-operational-resilience-1','financial-data-governance-1','financial-legacy-art-decommission-1','financial-p0-closure-1','financial-value-realization-1','financial-fee-intelligence-1','financial-opportunity-engine-1','financial-document-intelligence-1','financial-provider-qualification-1') then
    raise exception 'schema_version não avançou';
  end if;
end $$;

-- 2. Fixtures: comprador A (admin + aprovador + viewer), comprador B, provedores A e B, externo.
insert into auth.users(id,email,email_confirmed_at) values
('00000000-0000-4000-8000-000000002101','sh-buyer-a@example.invalid',now()),
('00000000-0000-4000-8000-000000002102','sh-approver-a@example.invalid',now()),
('00000000-0000-4000-8000-000000002103','sh-buyer-b@example.invalid',now()),
('00000000-0000-4000-8000-000000002104','sh-provider-a@banco-a.invalid',now()),
('00000000-0000-4000-8000-000000002105','sh-provider-b@banco-b.invalid',now()),
('00000000-0000-4000-8000-000000002106','sh-outsider@example.invalid',now()),
('00000000-0000-4000-8000-000000002107','sh-pending@example.invalid',null),
('00000000-0000-4000-8000-000000002108','sh-viewer-a@example.invalid',now())
on conflict(id) do nothing;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-000000002201','Compradora A SH DEMO','BUYER','00000000-0000-4000-8000-000000002101'),
('00000000-0000-4000-8000-000000002202','Compradora B SH DEMO','BUYER','00000000-0000-4000-8000-000000002103'),
('00000000-0000-4000-8000-000000002203','Banco A SH DEMO','PROVIDER','00000000-0000-4000-8000-000000002104'),
('00000000-0000-4000-8000-000000002204','Banco B SH DEMO','PROVIDER','00000000-0000-4000-8000-000000002105')
on conflict do nothing;
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-000000002201','00000000-0000-4000-8000-000000002101','admin'),
('00000000-0000-4000-8000-000000002201','00000000-0000-4000-8000-000000002102','finance_manager'),
('00000000-0000-4000-8000-000000002201','00000000-0000-4000-8000-000000002108','viewer'),
('00000000-0000-4000-8000-000000002202','00000000-0000-4000-8000-000000002103','admin'),
('00000000-0000-4000-8000-000000002203','00000000-0000-4000-8000-000000002104','provider_user'),
('00000000-0000-4000-8000-000000002204','00000000-0000-4000-8000-000000002105','provider_user')
on conflict do nothing;
insert into public.fin_providers(id,organization_id,name,kind,contact_email,created_by) values
('00000000-0000-4000-8000-000000002301','00000000-0000-4000-8000-000000002201','Banco A SH DEMO','bank','sh-provider-a@banco-a.invalid','00000000-0000-4000-8000-000000002101'),
('00000000-0000-4000-8000-000000002302','00000000-0000-4000-8000-000000002201','Banco B SH DEMO','bank','sh-provider-b@banco-b.invalid','00000000-0000-4000-8000-000000002101')
on conflict do nothing;
insert into public.fin_rfqs(id,organization_id,product,title,status,owner_id,demand) values
('00000000-0000-4000-8000-000000002401','00000000-0000-4000-8000-000000002201','credit','RFQ SH DEMO','open','00000000-0000-4000-8000-000000002101','{}')
on conflict do nothing;
insert into public.fin_pilot_allowlist(pattern,created_by,note) values ('@segredo-sh.invalid','00000000-0000-4000-8000-000000002101','teste')
on conflict do nothing;
create temporary table sh_ids(key text primary key, value text);
grant all on sh_ids to authenticated;

-- Convites e propostas de A e B, pelo caminho do produto.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002101',false);
insert into sh_ids values
 ('inv_a', public.fin_invite_provider('00000000-0000-4000-8000-000000002401','00000000-0000-4000-8000-000000002301')),
 ('inv_b', public.fin_invite_provider('00000000-0000-4000-8000-000000002401','00000000-0000-4000-8000-000000002302')),
 ('member', public.fin_invite_member('00000000-0000-4000-8000-000000002201','sh-pending@example.invalid','analyst'));
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002104',false);
select public.fin_accept_provider_invite((select value from sh_ids where key='inv_a'),'00000000-0000-4000-8000-000000002203');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002105',false);
select public.fin_accept_provider_invite((select value from sh_ids where key='inv_b'),'00000000-0000-4000-8000-000000002204');
reset role;
insert into sh_ids select 'prop_a', id::text from public.fin_proposals where provider_organization_id='00000000-0000-4000-8000-000000002203';
insert into sh_ids select 'prop_b', id::text from public.fin_proposals where provider_organization_id='00000000-0000-4000-8000-000000002204';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002104',false);
select public.fin_submit_proposal((select value::uuid from sh_ids where key='prop_a'),'{"rate":"1.9"}','v1');
select public.fin_add_comment('proposal',(select value::uuid from sh_ids where key='prop_a'),'provider_visible','Comentário do banco A',null,null);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002105',false);
select public.fin_submit_proposal((select value::uuid from sh_ids where key='prop_b'),'{"rate":"2.1"}','v1');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002101',false);
select public.fin_add_comment('rfq','00000000-0000-4000-8000-000000002401','internal','Nota interna da compradora A',null,null);
reset role;

-- 3. Exploits corrigidos: auxiliares internas deixaram de ser RPC.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002106',false);
do $$ begin
  perform public.fin_pilot_access_allowed('qualquer@segredo-sh.invalid');
  raise exception 'externo enumerou a allowlist do piloto';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.fin_comment_object_org('rfq','00000000-0000-4000-8000-000000002401');
  raise exception 'externo descobriu a organização dona de uma RFQ';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.fin_setting('invite_secret', '');
  raise exception 'externo leu fin_setting';
exception when insufficient_privilege then null; end $$;
reset role;
set role anon;
do $$ begin
  perform 1 from public.v_commercial_pipeline limit 1;
  raise exception 'anon leu view legada';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform 1 from public.artwork_events limit 1;
  raise exception 'anon leu artwork_events';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.fin_create_organization('Anon DEMO','BUYER','BR');
  raise exception 'anon criou organização';
exception when insufficient_privilege then null; end $$;
reset role;

-- Convite de membro exige e-mail confirmado.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002107',false);
do $$ begin
  perform public.fin_accept_member_invitation((select value from sh_ids where key='member'));
  raise exception 'convite de membro aceito com e-mail não confirmado';
exception when others then if sqlerrm <> 'invalid invitation' then raise; end if; end $$;
reset role;
update auth.users set email_confirmed_at = now() where id='00000000-0000-4000-8000-000000002107';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002107',false);
do $$ begin
  if public.fin_accept_member_invitation((select value from sh_ids where key='member')) <> '00000000-0000-4000-8000-000000002201' then
    raise exception 'convite confirmado não aceito';
  end if;
end $$;
-- Replay do mesmo token.
do $$ begin
  perform public.fin_accept_member_invitation((select value from sh_ids where key='member'));
  raise exception 'convite de membro reutilizado';
exception when others then if sqlerrm <> 'invalid invitation' then raise; end if; end $$;
reset role;

-- 4. Matriz adversarial: cada ator tenta agir sobre objetos que não são dele,
--    chamando a RPC direto (sem passar pela API). Todas precisam falhar.
create temporary table sh_attacks(actor text, label text, stmt text);
grant all on sh_attacks to authenticated;
insert into sh_attacks values
 -- comprador B contra a RFQ/propostas de A
 ('2103','B transiciona RFQ de A',$q$select public.fin_transition('rfq','00000000-0000-4000-8000-000000002401','cancelled')$q$),
 ('2103','B revisa RFQ de A',$q$select public.fin_revise_rfq('00000000-0000-4000-8000-000000002401',1,'Invasão','x','{}',null)$q$),
 ('2103','B convida provedor na RFQ de A',$q$select public.fin_invite_provider('00000000-0000-4000-8000-000000002401','00000000-0000-4000-8000-000000002301')$q$),
 ('2103','B pede aprovação na RFQ de A',$q$select public.fin_request_approval('00000000-0000-4000-8000-000000002401',(select value::uuid from sh_ids where key='prop_a'),array['00000000-0000-4000-8000-000000002103']::uuid[],'x')$q$),
 ('2103','B registra decisão na RFQ de A',$q$select public.fin_record_decision('00000000-0000-4000-8000-000000002401',(select value::uuid from sh_ids where key='prop_a'),'{}','x')$q$),
 ('2103','B comenta na RFQ de A',$q$select public.fin_add_comment('rfq','00000000-0000-4000-8000-000000002401','internal','invasão',null,null)$q$),
 ('2103','B busca na organização de A',$q$select public.fin_search('00000000-0000-4000-8000-000000002201','sh',null,10,0)$q$),
 ('2103','B convida membro para A',$q$select public.fin_invite_member('00000000-0000-4000-8000-000000002201','x@example.invalid','admin')$q$),
 ('2103','B altera perfil de A',$q$select public.fin_update_organization('00000000-0000-4000-8000-000000002201','X',null,null,null)$q$),
 ('2103','B muda política de aprovação de A',$q$select public.fin_set_approval_policy('00000000-0000-4000-8000-000000002201',false)$q$),
 ('2103','B registra evento na org de A',$q$select public.fin_record_client_event('00000000-0000-4000-8000-000000002201','rfq','00000000-0000-4000-8000-000000002401','comparison_viewed')$q$),
 ('2103','B processa renovações de A',$q$select public.fin_process_renewals('00000000-0000-4000-8000-000000002201',current_date)$q$),
 ('2103','B marca avisos na org de A',$q$select public.fin_mark_notifications('00000000-0000-4000-8000-000000002201',null)$q$),
 ('2103','B salva rascunho de RFQ em A',$q$select public.fin_save_rfq_editor('00000000-0000-4000-8000-000000002201','{"title":"x"}',0)$q$),
 ('2103','B sobe documento na RFQ de A',$q$select public.fin_document_begin_upload('00000000-0000-4000-8000-000000002201','rfq','00000000-0000-4000-8000-000000002401','Doc','internal','application/pdf',10,null,null)$q$),
 ('2103','B aponta RFQ de A em org própria',$q$select public.fin_document_begin_upload('00000000-0000-4000-8000-000000002202','rfq','00000000-0000-4000-8000-000000002401','Doc','internal','application/pdf',10,null,null)$q$),
 ('2103','B aceita termos por A',$q$select public.fin_accept_terms('00000000-0000-4000-8000-000000002201','2026-09-01','pilot')$q$),
 ('2103','B edita o próprio perfil de membro em A',$q$select public.fin_update_my_member_profile('00000000-0000-4000-8000-000000002201','Invasor',null)$q$),
 -- provedor B contra a proposta do provedor A
 ('2105','Provedor B envia proposta de A',$q$select public.fin_submit_proposal((select value::uuid from sh_ids where key='prop_a'),'{"rate":"0.1"}','x')$q$),
 ('2105','Provedor B salva rascunho de A',$q$select public.fin_save_proposal_draft((select value::uuid from sh_ids where key='prop_a'),'{"rate":"0.1"}',0,1)$q$),
 ('2105','Provedor B retira proposta de A',$q$select public.fin_withdraw_proposal((select value::uuid from sh_ids where key='prop_a'))$q$),
 ('2105','Provedor B comenta proposta de A',$q$select public.fin_add_comment('proposal',(select value::uuid from sh_ids where key='prop_a'),'provider_visible','x',null,null)$q$),
 ('2105','Provedor B sobe documento na proposta de A',$q$select public.fin_document_begin_upload('00000000-0000-4000-8000-000000002204','proposal',(select value::uuid from sh_ids where key='prop_a'),'Doc','shared','application/pdf',10,null,null)$q$),
 ('2105','Provedor B faz comentário interno na RFQ',$q$select public.fin_add_comment('rfq','00000000-0000-4000-8000-000000002401','internal','x',null,null)$q$),
 ('2105','Provedor B menciona o comprador',$q$select public.fin_add_comment('rfq','00000000-0000-4000-8000-000000002401','provider_visible','x',array['00000000-0000-4000-8000-000000002101']::uuid[],null)$q$),
 ('2105','Provedor B transiciona RFQ',$q$select public.fin_transition('rfq','00000000-0000-4000-8000-000000002401','comparing')$q$),
 ('2105','Provedor B registra decisão',$q$select public.fin_record_decision('00000000-0000-4000-8000-000000002401',(select value::uuid from sh_ids where key='prop_b'),'{}','x')$q$),
 ('2105','Provedor B cria RFQ na org do provedor',$q$select public.fin_create_rfq('00000000-0000-4000-8000-000000002204','credit','x','x','{}',null)$q$),
 ('2105','Provedor B cria RFQ em nome de A',$q$select public.fin_create_rfq('00000000-0000-4000-8000-000000002201','credit','x','x','{}',null)$q$),
 ('2105','Provedor B console finance_ops',$q$select public.fin_ops_overview()$q$),
 -- externo, sem organização
 ('2106','Externo cria organização fora da allowlist',$q$select public.fin_create_organization('Externa DEMO','BUYER','BR')$q$),
 ('2106','Externo aceita convite do provedor com token de A',$q$select public.fin_accept_provider_invite((select value from sh_ids where key='inv_a'),'00000000-0000-4000-8000-000000002203')$q$),
 ('2106','Externo transiciona RFQ',$q$select public.fin_transition('rfq','00000000-0000-4000-8000-000000002401','cancelled')$q$),
 ('2106','Externo lê trilha operacional',$q$select public.fin_ops_trace(null,'00000000-0000-4000-8000-000000002401')$q$),
 ('2106','Externo baixa documento inexistente',$q$select public.fin_document_authorize_download(gen_random_uuid(),null)$q$),
 ('2106','Externo responde comentário interno',$q$select public.fin_reply_comment((select id from public.fin_comments where body='Nota interna da compradora A'),'x',null,null)$q$),
 -- viewer da própria compradora A: só lê
 ('2108','Viewer de A cria RFQ',$q$select public.fin_create_rfq('00000000-0000-4000-8000-000000002201','credit','x','x','{}',null)$q$),
 ('2108','Viewer de A convida provedor',$q$select public.fin_invite_provider('00000000-0000-4000-8000-000000002401','00000000-0000-4000-8000-000000002301')$q$),
 ('2108','Viewer de A transiciona RFQ',$q$select public.fin_transition('rfq','00000000-0000-4000-8000-000000002401','comparing')$q$),
 ('2108','Viewer de A convida admin',$q$select public.fin_invite_member('00000000-0000-4000-8000-000000002201','x@example.invalid','admin')$q$),
 -- aprovador sem etapa pendente (não há solicitação) e escalada de papel
 ('2102','Gestor de A convida admin (só admin convida)',$q$select public.fin_invite_member('00000000-0000-4000-8000-000000002201','x@example.invalid','admin')$q$),
 ('2102','Gestor de A liga política de aprovação (só admin)',$q$select public.fin_set_approval_policy('00000000-0000-4000-8000-000000002201',true)$q$),
 ('2102','Gestor de A aprova solicitação inexistente',$q$select public.fin_act_on_approval(gen_random_uuid(),'approved',null)$q$);

do $$
declare a record; v_leaks text := '';
begin
  for a in select * from sh_attacks loop
    perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000' || a.actor, false);
    begin
      execute a.stmt;
      -- Recusa silenciosa (null) só é aceitável no aceite de convite.
      if a.label not like '%aceita convite%' then v_leaks := v_leaks || a.label || '; '; end if;
    exception when others then
      -- Erro de escrita do próprio teste não conta como recusa.
      if sqlstate in ('42601','42883','42703','42P01','42804','22P02') then
        raise exception 'ataque mal escrito (%): % — %', a.label, sqlstate, sqlerrm;
      end if;
    end;
  end loop;
  if v_leaks <> '' then raise exception 'ataques aceitos: %', v_leaks; end if;
end $$;
reset role;

-- Nada mudou por efeito colateral dos ataques.
do $$ begin
  if (select status from public.fin_rfqs where id='00000000-0000-4000-8000-000000002401') <> 'collecting' then raise exception 'RFQ de A alterada'; end if;
  if (select current_version from public.fin_proposals where id=(select value::uuid from sh_ids where key='prop_a')) <> 1 then raise exception 'proposta de A alterada'; end if;
  if (select status from public.fin_proposals where id=(select value::uuid from sh_ids where key='prop_a')) <> 'submitted' then raise exception 'proposta de A retirada'; end if;
  if exists (select 1 from public.fin_organizations where legal_name in ('Externa DEMO','Anon DEMO')) then raise exception 'organização criada por invasor'; end if;
  if exists (select 1 from public.fin_members where user_id='00000000-0000-4000-8000-000000002103' and organization_id='00000000-0000-4000-8000-000000002201') then raise exception 'B entrou em A'; end if;
  if (select legal_name from public.fin_organizations where id='00000000-0000-4000-8000-000000002201') <> 'Compradora A SH DEMO'
     or (select trade_name from public.fin_organizations where id='00000000-0000-4000-8000-000000002201') is not null then raise exception 'perfil de A alterado'; end if;
  if exists (select 1 from public.fin_proposal_drafts where proposal_id=(select value::uuid from sh_ids where key='prop_a')) then raise exception 'rascunho de A criado por B'; end if;
  if exists (select 1 from public.fin_invite_acceptance_denials d join public.fin_rfq_invites i on i.id=d.invite_id where i.rfq_id='00000000-0000-4000-8000-000000002401' and d.user_id <> '00000000-0000-4000-8000-000000002106') then raise exception 'recusa inesperada'; end if;
end $$;

-- 5. Leitura por RLS: cada ator enxerga só o que é dele.
set role authenticated;
do $$
declare r record; v_count integer; v_leaks text := '';
begin
  for r in select * from (values
    ('2103','fin_rfqs'),('2103','fin_proposals'),('2103','fin_proposal_versions'),('2103','fin_comments'),('2103','fin_events'),
    ('2103','fin_rfq_invites'),('2103','fin_providers'),('2103','fin_members'),('2103','fin_notifications'),('2103','fin_decisions'),
    ('2103','fin_contracts'),('2103','fin_private_documents'),('2103','fin_approval_requests'),
    ('2106','fin_rfqs'),('2106','fin_proposals'),('2106','fin_proposal_versions'),('2106','fin_comments'),('2106','fin_events'),
    ('2106','fin_organizations'),('2106','fin_members'),('2106','fin_providers'),('2106','fin_rfq_invites'),('2106','fin_notifications')
  ) t(actor, tbl) loop
    perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000' || r.actor, false);
    execute format($f$select count(*) from public.%I where %s$f$, r.tbl,
      case r.tbl
        when 'fin_rfqs' then $w$id='00000000-0000-4000-8000-000000002401'$w$
        when 'fin_proposals' then $w$rfq_id='00000000-0000-4000-8000-000000002401'$w$
        when 'fin_proposal_versions' then $w$proposal_id in (select value::uuid from sh_ids where key in ('prop_a','prop_b'))$w$
        when 'fin_rfq_invites' then $w$rfq_id='00000000-0000-4000-8000-000000002401'$w$
        when 'fin_organizations' then $w$id in ('00000000-0000-4000-8000-000000002201','00000000-0000-4000-8000-000000002203')$w$
        else $w$organization_id='00000000-0000-4000-8000-000000002201'$w$ end)
      into v_count;
    if v_count > 0 then v_leaks := v_leaks || r.actor || ':' || r.tbl || '; '; end if;
  end loop;
  if v_leaks <> '' then raise exception 'vazamento por RLS: %', v_leaks; end if;
end $$;
-- Provedor B vê a própria proposta e não a de A (nem versões, nem comentários).
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002105',false);
do $$ begin
  if (select count(*) from public.fin_proposals where rfq_id='00000000-0000-4000-8000-000000002401') <> 1 then raise exception 'B vê proposta de outro provedor'; end if;
  if exists (select 1 from public.fin_proposal_versions where proposal_id=(select value::uuid from sh_ids where key='prop_a')) then raise exception 'B vê termos de A'; end if;
  if exists (select 1 from public.fin_comments where body in ('Comentário do banco A','Nota interna da compradora A')) then raise exception 'B vê comentário de A ou interno'; end if;
  if exists (select 1 from public.fin_rfq_invites where provider_id='00000000-0000-4000-8000-000000002301') then raise exception 'B vê convite de A'; end if;
end $$;
reset role;

drop table sh_attacks;
drop table sh_ids;
\echo 'Surface hardening: client-executable functions match the reviewed allowlist, no anon RPC beyond pure helpers, no mutable search_path, RLS on every table, legacy views closed, allowlist/object-org oracles closed, member invite needs confirmed e-mail, and 43 cross-tenant/role attacks refused without side effects.'

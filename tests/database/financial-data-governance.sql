\set ON_ERROR_STOP on
-- P0.11 Data Governance (docs/supabase-financial-data-governance.sql):
-- superfície, RLS forçado, políticas de retenção versionadas, legal hold,
-- executor de retenção (lote, hold, rerun, dry-run), export portável e
-- isolado, offboarding (estados, revogação idempotente, sessão/conta de
-- serviço/webhook/SSO), e a matriz negativa entre papéis e tenants.
-- Pessoas ...0000000d90NN: 01 admin G · 02 analista G · 03 viewer G
--   04 gestor restrito a entidade G · 05 admin O (outro tenant)
--   06 usuário de provedor · 07 sem vínculo · 08 operador finance_ops
insert into auth.users(id,email) values
('00000000-0000-4000-8000-0000000d9001','gov-admin@example.invalid'),
('00000000-0000-4000-8000-0000000d9002','gov-analyst@example.invalid'),
('00000000-0000-4000-8000-0000000d9003','gov-viewer@example.invalid'),
('00000000-0000-4000-8000-0000000d9004','gov-entity@example.invalid'),
('00000000-0000-4000-8000-0000000d9005','gov-other@example.invalid'),
('00000000-0000-4000-8000-0000000d9006','gov-provider@example.invalid'),
('00000000-0000-4000-8000-0000000d9007','gov-outsider@example.invalid'),
('00000000-0000-4000-8000-0000000d9008','gov-ops@example.invalid')
on conflict(id) do nothing;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-0000000d9101','Grupo Governança DEMO','BUYER','00000000-0000-4000-8000-0000000d9001'),
('00000000-0000-4000-8000-0000000d9102','Outro Governança DEMO','BUYER','00000000-0000-4000-8000-0000000d9005'),
('00000000-0000-4000-8000-0000000d9103','Banco Governança DEMO','PROVIDER','00000000-0000-4000-8000-0000000d9006');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-0000000d9101','00000000-0000-4000-8000-0000000d9001','admin'),
('00000000-0000-4000-8000-0000000d9101','00000000-0000-4000-8000-0000000d9002','analyst'),
('00000000-0000-4000-8000-0000000d9101','00000000-0000-4000-8000-0000000d9003','viewer'),
('00000000-0000-4000-8000-0000000d9101','00000000-0000-4000-8000-0000000d9004','finance_manager'),
('00000000-0000-4000-8000-0000000d9102','00000000-0000-4000-8000-0000000d9005','admin'),
('00000000-0000-4000-8000-0000000d9103','00000000-0000-4000-8000-0000000d9006','admin');
insert into public.fin_legal_entities(id,organization_id,kind,parent_id,legal_name,currency,created_by) values
('00000000-0000-4000-8000-0000000d9201','00000000-0000-4000-8000-0000000d9101','legal_entity',null,'Gov A Ltda DEMO','BRL','00000000-0000-4000-8000-0000000d9001');
update public.fin_members set entity_scope='entities' where user_id='00000000-0000-4000-8000-0000000d9004';
insert into public.fin_member_entity_grants(organization_id,user_id,entity_id,granted_by) values
('00000000-0000-4000-8000-0000000d9101','00000000-0000-4000-8000-0000000d9004','00000000-0000-4000-8000-0000000d9201','00000000-0000-4000-8000-0000000d9001');
insert into public.fin_platform_operators(user_id,granted_by) values ('00000000-0000-4000-8000-0000000d9008','test-governance') on conflict do nothing;
insert into public.fin_rfqs(id,organization_id,product,title,owner_id,status,demand) values
('00000000-0000-4000-8000-0000000d9301','00000000-0000-4000-8000-0000000d9101','credit','RFQ governança DEMO','00000000-0000-4000-8000-0000000d9001','draft','{"amount":100000}'::jsonb),
('00000000-0000-4000-8000-0000000d9302','00000000-0000-4000-8000-0000000d9102','credit','RFQ outro tenant DEMO','00000000-0000-4000-8000-0000000d9005','draft','{"amount":5}'::jsonb);
-- Integrações do grupo G (como o banco já teria): conta de serviço, credencial,
-- webhook com entrega antiga e pendente, conexão SSO ativa, eventos SSO.
insert into public.fin_service_accounts(id,organization_id,name,scopes,created_by) values
('00000000-0000-4000-8000-0000000d9401','00000000-0000-4000-8000-0000000d9101','ERP Gov',array['rfqs:read'],'00000000-0000-4000-8000-0000000d9001');
insert into public.fin_api_credentials(organization_id,service_account_id,token_prefix,token_hash,created_by,expires_at) values
('00000000-0000-4000-8000-0000000d9101','00000000-0000-4000-8000-0000000d9401','arnd_test_Govabc',repeat('0d9f',16),'00000000-0000-4000-8000-0000000d9001',now()+interval '30 days');
insert into public.fin_webhook_endpoints(id,organization_id,url,events,secret_ciphertext,created_by_user) values
('00000000-0000-4000-8000-0000000d9501','00000000-0000-4000-8000-0000000d9101','https://erp.example.com/gov',array['rfq.created'],'v1.aaaa.bbbb.cccc','00000000-0000-4000-8000-0000000d9001');
insert into public.fin_webhook_events(id,organization_id,event_type,source_event_id,payload,occurred_at)
select ('00000000-0000-4000-8000-0000000d95' || lpad(g::text, 2, '0'))::uuid,'00000000-0000-4000-8000-0000000d9101','rfq.created',gen_random_uuid(),'{"a":1}'::jsonb,now()-interval '400 days'
  from generate_series(11,18) g;
insert into public.fin_webhook_deliveries(organization_id,endpoint_id,event_id,status,created_at)
select '00000000-0000-4000-8000-0000000d9101','00000000-0000-4000-8000-0000000d9501',('00000000-0000-4000-8000-0000000d95' || lpad(g::text, 2, '0'))::uuid,'succeeded',now()-interval '400 days'-(g||' minutes')::interval
  from generate_series(11,17) g;
insert into public.fin_webhook_deliveries(organization_id,endpoint_id,event_id,status) values
('00000000-0000-4000-8000-0000000d9101','00000000-0000-4000-8000-0000000d9501','00000000-0000-4000-8000-0000000d9518','pending');
insert into public.fin_sso_connections(id,organization_id,protocol,display_name,status,created_by) values
('00000000-0000-4000-8000-0000000d9601','00000000-0000-4000-8000-0000000d9101','saml','Entra Gov','draft','00000000-0000-4000-8000-0000000d9001');
insert into public.fin_sso_events(organization_id,connection_id,outcome,reason_code,happened_at)
select '00000000-0000-4000-8000-0000000d9101','00000000-0000-4000-8000-0000000d9601','denied','domain_not_verified',now()-interval '800 days' from generate_series(1,3);
insert into public.fin_sso_events(organization_id,connection_id,outcome,reason_code) values
('00000000-0000-4000-8000-0000000d9101','00000000-0000-4000-8000-0000000d9601','success','test_login');
insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body,created_at)
select '00000000-0000-4000-8000-0000000d9101','00000000-0000-4000-8000-0000000d9002','task_assigned','task',gen_random_uuid(),gen_random_uuid(),'Aviso antigo','corpo',now()-interval '90 days' from generate_series(1,4);
insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body) values
('00000000-0000-4000-8000-0000000d9101','00000000-0000-4000-8000-0000000d9002','task_assigned','task',gen_random_uuid(),gen_random_uuid(),'Aviso novo','corpo'),
('00000000-0000-4000-8000-0000000d9102','00000000-0000-4000-8000-0000000d9005','task_assigned','task',gen_random_uuid(),gen_random_uuid(),'Outro tenant','corpo');
update public.fin_notifications set created_at = now()-interval '90 days' where organization_id='00000000-0000-4000-8000-0000000d9102';
insert into public.fin_member_invitations(organization_id,email,role,token_hash,created_by,expires_at,created_at) values
('00000000-0000-4000-8000-0000000d9101','convidado-antigo@example.invalid','analyst',repeat('1',64),'00000000-0000-4000-8000-0000000d9001',now()-interval '50 days',now()-interval '57 days'),
('00000000-0000-4000-8000-0000000d9101','convidado-aberto@example.invalid','analyst',repeat('2',64),'00000000-0000-4000-8000-0000000d9001',now()+interval '5 days',now());

create temporary table gov_ids(key text primary key, value uuid);
grant all on gov_ids to authenticated, service_role;
create or replace function pg_temp.expect_error(p_sql text, p_message text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'esperava falha "%" em: %', p_message, p_sql;
exception when others then
  if sqlerrm not like p_message || '%' then raise exception 'falha inesperada em %: % (esperava %)', p_sql, sqlerrm, p_message; end if;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated, service_role;
create or replace function pg_temp.as_user(p_suffix text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000d90' || p_suffix, false),
         set_config('request.jwt.claims', '', false);
$$;
grant execute on function pg_temp.as_user(text) to authenticated, service_role;
create or replace function pg_temp.as_ops() returns void language sql as $$
  select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000d9008', false),
         set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000d9008","aal":"aal2","app_metadata":{"arandu_role":"finance_ops"}}', false);
$$;
grant execute on function pg_temp.as_ops() to authenticated, service_role;

-- 1. Superfície: tabelas novas com RLS forçado; nada para anon; conteúdo do
-- export e funções de job/revogação fora do alcance do cliente.
do $$
declare t text;
begin
  foreach t in array array['fin_retention_policies','fin_legal_holds','fin_data_exports','fin_data_export_parts','fin_offboarding_requests','fin_offboarding_member_archive','fin_governance_log'] loop
    if not (select relrowsecurity and relforcerowsecurity from pg_class where oid = ('public.' || t)::regclass) then raise exception 'RLS não forçado em %', t; end if;
    if has_table_privilege('anon', 'public.' || t, 'SELECT') or has_table_privilege('authenticated', 'public.' || t, 'INSERT')
       or has_table_privilege('authenticated', 'public.' || t, 'UPDATE') or has_table_privilege('authenticated', 'public.' || t, 'DELETE') then
      raise exception 'escrita direta ou anon em %', t;
    end if;
  end loop;
  if has_table_privilege('authenticated','public.fin_data_export_parts','SELECT') or has_table_privilege('authenticated','public.fin_offboarding_member_archive','SELECT')
     or has_column_privilege('authenticated','public.fin_data_exports','manifest','SELECT')
     or has_function_privilege('authenticated','public.fin_governance_build_export(integer)','EXECUTE')
     or has_function_privilege('authenticated','public.fin_governance_revoke_org_access(uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.fin_governance_offboarding_advance(integer)','EXECUTE')
     or has_function_privilege('authenticated','public.fin_governance_export_datasets()','EXECUTE')
     or has_function_privilege('anon','public.fin_governance_request_export(uuid,text)','EXECUTE')
     or has_function_privilege('anon','public.fin_governance_retention_run(boolean,integer,uuid,text)','EXECUTE') then
    raise exception 'superfície de governança exposta ao cliente';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'fin_governance%'
             and p.prosecdef and not coalesce(array_to_string(p.proconfig, ',') like '%search_path=%', false)) then
    raise exception 'SECURITY DEFINER sem search_path';
  end if;
end $$;

-- 2. Políticas de retenção: só admin; sem classe de negócio; limites técnicos;
-- versão; ativação substitui a anterior; plataforma só com operador.
set role authenticated;
select pg_temp.as_user('02');
select pg_temp.expect_error($q$select public.fin_governance_save_retention_policy('00000000-0000-4000-8000-0000000d9101','TEMPORARY_OPERATIONAL',60,'Limpeza de avisos antigos')$q$, 'forbidden');
select pg_temp.as_user('04');
select pg_temp.expect_error($q$select public.fin_governance_save_retention_policy('00000000-0000-4000-8000-0000000d9101','TEMPORARY_OPERATIONAL',60,'Limpeza de avisos antigos')$q$, 'forbidden');
select pg_temp.as_user('06');
select pg_temp.expect_error($q$select public.fin_governance_save_retention_policy('00000000-0000-4000-8000-0000000d9101','TEMPORARY_OPERATIONAL',60,'Limpeza de avisos antigos')$q$, 'forbidden');
select pg_temp.expect_error($q$select public.fin_governance_save_retention_policy('00000000-0000-4000-8000-0000000d9103','TEMPORARY_OPERATIONAL',60,'Provedor tentando governança')$q$, 'forbidden');
select pg_temp.as_user('05');
select pg_temp.expect_error($q$select public.fin_governance_save_retention_policy('00000000-0000-4000-8000-0000000d9101','TEMPORARY_OPERATIONAL',60,'Admin de outro tenant')$q$, 'forbidden');
select pg_temp.as_user('01');
select pg_temp.expect_error($q$select public.fin_governance_save_retention_policy('00000000-0000-4000-8000-0000000d9101','FINANCIAL_RECORD',60,'Apagar contratos antigos')$q$, 'retention class not configurable');
select pg_temp.expect_error($q$select public.fin_governance_save_retention_policy('00000000-0000-4000-8000-0000000d9101','PLATFORM_TELEMETRY',60,'Classe de plataforma')$q$, 'retention class not configurable');
select pg_temp.expect_error($q$select public.fin_governance_save_retention_policy('00000000-0000-4000-8000-0000000d9101','SECURITY_EVENT',30,'Abaixo do piso técnico')$q$, 'invalid retention period');
select pg_temp.expect_error($q$select public.fin_governance_save_retention_policy('00000000-0000-4000-8000-0000000d9101','TEMPORARY_OPERATIONAL',60,'curto')$q$, 'invalid retention policy');
select pg_temp.expect_error($q$select public.fin_governance_save_retention_policy(null,'PLATFORM_TELEMETRY',60,'Admin de cliente tentando plataforma')$q$, 'forbidden');
insert into gov_ids select 'notif_v1', public.fin_governance_save_retention_policy('00000000-0000-4000-8000-0000000d9101','TEMPORARY_OPERATIONAL',120,'Avisos lidos perdem utilidade','TICKET-1');
insert into gov_ids select 'notif_v2', public.fin_governance_save_retention_policy('00000000-0000-4000-8000-0000000d9101','TEMPORARY_OPERATIONAL',60,'Avisos lidos perdem utilidade','TICKET-2');
insert into gov_ids select 'hooks', public.fin_governance_save_retention_policy('00000000-0000-4000-8000-0000000d9101','WEBHOOK_DELIVERY',365,'Diagnóstico de entregas por um ano');
insert into gov_ids select 'sso', public.fin_governance_save_retention_policy('00000000-0000-4000-8000-0000000d9101','SECURITY_EVENT',730,'Trilha de login por dois anos');
insert into gov_ids select 'pii', public.fin_governance_save_retention_policy('00000000-0000-4000-8000-0000000d9101','CONTACT_PII',30,'Convites encerrados sem e-mail');
do $$ begin if (select array_agg(version order by version) from public.fin_retention_policies where retention_class='TEMPORARY_OPERATIONAL'
     and organization_id='00000000-0000-4000-8000-0000000d9101') <> array[1,2] then raise exception 'versão de política errada'; end if; end $$;
select public.fin_governance_activate_retention_policy((select value from gov_ids where key='notif_v1'));
select public.fin_governance_activate_retention_policy((select value from gov_ids where key='notif_v2'));
select public.fin_governance_activate_retention_policy((select value from gov_ids where key='notif_v2'));
select public.fin_governance_activate_retention_policy(value) from gov_ids where key in ('hooks','sso','pii');
select pg_temp.expect_error(format($q$select public.fin_governance_activate_retention_policy('%s')$q$, (select value from gov_ids where key='notif_v1')), 'retention policy not draft');
do $$ begin
  if (select status from public.fin_retention_policies where id=(select value from gov_ids where key='notif_v1')) <> 'superseded'
     or (select count(*) from public.fin_retention_policies where status='active' and organization_id='00000000-0000-4000-8000-0000000d9101') <> 4 then
    raise exception 'ativação não substituiu a versão anterior';
  end if;
end $$;
-- Outros papéis não leem políticas; outro tenant também não.
select pg_temp.as_user('03');
do $$ begin if exists (select 1 from public.fin_retention_policies) or exists (select 1 from public.fin_legal_holds) then raise exception 'viewer lê governança'; end if; end $$;
select pg_temp.as_user('05');
do $$ begin if exists (select 1 from public.fin_retention_policies where organization_id='00000000-0000-4000-8000-0000000d9101') then raise exception 'outro tenant lê políticas'; end if; end $$;
-- Política de plataforma: operador com MFA.
reset role;
select pg_temp.as_ops();
set role authenticated;
insert into gov_ids select 'ops_policy', public.fin_governance_save_retention_policy(null,'PLATFORM_SECURITY_TRAIL',365,'Trilha operacional por um ano');
select public.fin_governance_activate_retention_policy((select value from gov_ids where key='ops_policy'));
reset role;

-- 3. Preview (dry-run) pelo admin: só contagens da própria organização; não apaga.
select pg_temp.as_user('01');
set role authenticated;
select pg_temp.expect_error($q$select public.fin_governance_retention_run(false,10,'00000000-0000-4000-8000-0000000d9101')$q$, 'forbidden');
select pg_temp.expect_error($q$select public.fin_governance_retention_run(true,10,'00000000-0000-4000-8000-0000000d9102')$q$, 'forbidden');
do $$
declare v jsonb := public.fin_governance_retention_run(true, 10, '00000000-0000-4000-8000-0000000d9101');
begin
  if (v->>'dry_run')::boolean is not true or jsonb_array_length(v->'items') <> 4
     or exists (select 1 from jsonb_array_elements(v->'items') i where i->>'organization_id' <> '00000000-0000-4000-8000-0000000d9101')
     or (select (i->>'eligible')::integer from jsonb_array_elements(v->'items') i where i->>'retention_class'='TEMPORARY_OPERATIONAL') <> 4
     or (select (i->>'eligible')::integer from jsonb_array_elements(v->'items') i where i->>'retention_class'='WEBHOOK_DELIVERY') <> 7
     or (select (i->>'eligible')::integer from jsonb_array_elements(v->'items') i where i->>'retention_class'='SECURITY_EVENT') <> 3
     or (select (i->>'eligible')::integer from jsonb_array_elements(v->'items') i where i->>'retention_class'='CONTACT_PII') <> 1
     or v::text ~ 'example\.invalid' then
    raise exception 'preview incorreto: %', v;
  end if;
end $$;
select pg_temp.as_user('02');
select pg_temp.expect_error($q$select public.fin_governance_retention_run(true,10,'00000000-0000-4000-8000-0000000d9101')$q$, 'forbidden');
reset role;
select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','',false);
do $$ begin if (select count(*) from public.fin_notifications where organization_id='00000000-0000-4000-8000-0000000d9101') <> 5 then raise exception 'preview apagou dados'; end if; end $$;

-- 4. Legal hold: só admin; escopo validado no tenant; hold bloqueia retenção.
set role authenticated;
select pg_temp.as_user('02');
select pg_temp.expect_error($q$select public.fin_governance_create_legal_hold('00000000-0000-4000-8000-0000000d9101','organization',null,null,'Auditoria externa em curso')$q$, 'forbidden');
select pg_temp.as_user('06');
select pg_temp.expect_error($q$select public.fin_governance_create_legal_hold('00000000-0000-4000-8000-0000000d9101','organization',null,null,'Provedor tentando hold')$q$, 'forbidden');
select pg_temp.as_user('05');
select pg_temp.expect_error($q$select public.fin_governance_create_legal_hold('00000000-0000-4000-8000-0000000d9101','organization',null,null,'Outro tenant tentando hold')$q$, 'forbidden');
select pg_temp.as_user('01');
select pg_temp.expect_error($q$select public.fin_governance_create_legal_hold('00000000-0000-4000-8000-0000000d9101','rfq','00000000-0000-4000-8000-0000000d9302',null,'RFQ de outro tenant')$q$, 'invalid legal hold');
select pg_temp.expect_error($q$select public.fin_governance_create_legal_hold('00000000-0000-4000-8000-0000000d9101','retention_class',null,'FINANCIAL_RECORD','Classe fora do catálogo')$q$, 'invalid legal hold');
select pg_temp.expect_error($q$select public.fin_governance_create_legal_hold('00000000-0000-4000-8000-0000000d9101','organization',null,null,'curto')$q$, 'invalid legal hold');
insert into gov_ids select 'hold_rfq', public.fin_governance_create_legal_hold('00000000-0000-4000-8000-0000000d9101','rfq','00000000-0000-4000-8000-0000000d9301',null,'Disputa contratual sobre esta RFQ','CASO-2026-01');
insert into gov_ids select 'hold_class', public.fin_governance_create_legal_hold('00000000-0000-4000-8000-0000000d9101','retention_class',null,'SECURITY_EVENT','Investigação de acesso em andamento');
select pg_temp.as_user('05');
do $$ begin if exists (select 1 from public.fin_legal_holds where organization_id='00000000-0000-4000-8000-0000000d9101') then raise exception 'outro tenant vê hold'; end if; end $$;
select pg_temp.expect_error(format($q$select public.fin_governance_release_legal_hold('%s','Outro tenant liberando hold')$q$, (select value from gov_ids where key='hold_rfq')), 'forbidden');
select pg_temp.as_user('02');
select pg_temp.expect_error(format($q$select public.fin_governance_release_legal_hold('%s','Analista liberando hold')$q$, (select value from gov_ids where key='hold_rfq')), 'forbidden');
reset role;

-- 5. Retenção real (job): hold bloqueia tudo da organização; liberado, o lote
-- respeita o limite; rerun é idempotente; outro tenant intocado.
select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','',false);
set role service_role;
do $$
declare v jsonb := public.fin_governance_retention_run(false, 3, null, 'gov-run-1');
begin
  if (select count(*) from public.fin_notifications where organization_id='00000000-0000-4000-8000-0000000d9101') <> 5
     or (select count(*) from jsonb_array_elements(v->'items') i where (i->>'held')::boolean) <> 4 then
    raise exception 'hold não bloqueou a retenção: %', v;
  end if;
end $$;
reset role;
set role authenticated;
select pg_temp.as_user('01');
do $$ begin if not public.fin_governance_release_legal_hold((select value from gov_ids where key='hold_rfq'), 'Disputa encerrada por acordo') then raise exception 'liberação falhou'; end if; end $$;
do $$ begin if public.fin_governance_release_legal_hold((select value from gov_ids where key='hold_rfq'), 'Liberação repetida') then raise exception 'liberação dupla alterou o hold'; end if; end $$;
reset role;
select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','',false);
set role service_role;
do $$
declare v jsonb := public.fin_governance_retention_run(false, 3, null, 'gov-run-2');
begin
  -- Hold de classe SECURITY_EVENT segue ativo: só essa classe fica retida.
  if (select (i->>'held')::boolean from jsonb_array_elements(v->'items') i where i->>'retention_class'='SECURITY_EVENT' and i->>'organization_id'='00000000-0000-4000-8000-0000000d9101') is not true
     or (select count(*) from public.fin_sso_events where organization_id='00000000-0000-4000-8000-0000000d9101') <> 4 then
    raise exception 'hold de classe não reteve eventos de segurança: %', v;
  end if;
  if (select count(*) from public.fin_notifications where organization_id='00000000-0000-4000-8000-0000000d9101') <> 2
     or (select count(*) from public.fin_webhook_deliveries where endpoint_id='00000000-0000-4000-8000-0000000d9501') <> 5 then
    raise exception 'lote de retenção não respeitou o limite: %', v;
  end if;
  if (select count(*) from public.fin_notifications where organization_id='00000000-0000-4000-8000-0000000d9102') <> 1 then
    raise exception 'retenção alcançou outro tenant sem política';
  end if;
end $$;
select public.fin_governance_retention_run(false, 3, null, 'gov-run-3');
select public.fin_governance_retention_run(false, 3, null, 'gov-run-4');
do $$
declare v jsonb := public.fin_governance_retention_run(false, 3, null, 'gov-run-5');
begin
  if (select count(*) from public.fin_notifications where organization_id='00000000-0000-4000-8000-0000000d9101') <> 1
     or (select count(*) from public.fin_webhook_deliveries where endpoint_id='00000000-0000-4000-8000-0000000d9501') <> 1
     or not exists (select 1 from public.fin_webhook_deliveries where endpoint_id='00000000-0000-4000-8000-0000000d9501' and status='pending')
     or (v->>'processed')::integer <> 0 then
    raise exception 'retenção não convergiu ou rerun não é idempotente: %', v;
  end if;
  if exists (select 1 from public.fin_member_invitations where organization_id='00000000-0000-4000-8000-0000000d9101' and email='convidado-antigo@example.invalid')
     or not exists (select 1 from public.fin_member_invitations where email='convidado-aberto@example.invalid') then
    raise exception 'anonimização de convite incorreta';
  end if;
  -- Evidência sem dado apagado: contagem, classe, política e versão.
  if (select sum(object_count) from public.fin_governance_log where organization_id='00000000-0000-4000-8000-0000000d9101' and action='retention_purged'
        and retention_class='TEMPORARY_OPERATIONAL' and policy_version=2) <> 4
     or not exists (select 1 from public.fin_events where organization_id='00000000-0000-4000-8000-0000000d9101' and event_type='retention_purged')
     or exists (select 1 from public.fin_events where event_type like 'retention%' and metadata::text ~ 'example\.invalid|Aviso') then
    raise exception 'trilha de retenção ausente ou com dado';
  end if;
end $$;
-- Concorrência: execução simultânea encontra o lock e falha como "job busy".
reset role;

-- 6. Export: admin pede; entidade restrita, viewer, provedor e outro tenant não;
-- pedido é idempotente; job monta; conteúdo isolado e sem segredo.
set role authenticated;
select pg_temp.as_user('04');
select pg_temp.expect_error($q$select public.fin_governance_request_export('00000000-0000-4000-8000-0000000d9101')$q$, 'forbidden');
select pg_temp.as_user('03');
select pg_temp.expect_error($q$select public.fin_governance_request_export('00000000-0000-4000-8000-0000000d9101')$q$, 'forbidden');
select pg_temp.as_user('06');
select pg_temp.expect_error($q$select public.fin_governance_request_export('00000000-0000-4000-8000-0000000d9101')$q$, 'forbidden');
select pg_temp.expect_error($q$select public.fin_governance_request_export('00000000-0000-4000-8000-0000000d9103')$q$, 'forbidden');
select pg_temp.as_user('07');
select pg_temp.expect_error($q$select public.fin_governance_request_export('00000000-0000-4000-8000-0000000d9101')$q$, 'forbidden');
select pg_temp.as_user('05');
select pg_temp.expect_error($q$select public.fin_governance_request_export('00000000-0000-4000-8000-0000000d9101')$q$, 'forbidden');
insert into gov_ids select 'export_other', public.fin_governance_request_export('00000000-0000-4000-8000-0000000d9102');
select pg_temp.as_user('01');
insert into gov_ids select 'export', public.fin_governance_request_export('00000000-0000-4000-8000-0000000d9101');
do $$ begin if public.fin_governance_request_export('00000000-0000-4000-8000-0000000d9101') <> (select value from gov_ids where key='export') then raise exception 'pedido de export duplicado'; end if; end $$;
select pg_temp.expect_error(format($q$select public.fin_governance_export_manifest('%s')$q$, (select value from gov_ids where key='export')), 'export not available');
reset role;
select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','',false);
set role service_role;
select public.fin_governance_build_export();
select public.fin_governance_build_export();
do $$ begin if (public.fin_governance_build_export()->>'processed')::integer <> 0 then raise exception 'job de export não esvaziou a fila'; end if; end $$;
do $$
declare v_text text;
begin
  if (select status from public.fin_data_exports where id=(select value from gov_ids where key='export')) <> 'ready' then raise exception 'export não ficou pronto'; end if;
  select string_agg(content, '') into v_text from public.fin_data_export_parts where export_id=(select value from gov_ids where key='export');
  if v_text ~ 'Outro Governança|RFQ outro tenant|0000000d9102' then raise exception 'export do tenant A contém o tenant B'; end if;
  if v_text !~ 'RFQ governança DEMO' or v_text !~ 'Gov A Ltda DEMO' then raise exception 'export sem dados do tenant'; end if;
  if v_text ~ '"(token_hash|secret_ciphertext|verification_token_hash|lease_token|storage_path|subject_hash)"' or v_text ~ 'v1\.aaaa\.bbbb' or v_text ~ '0d9f0d9f0d9f' then
    raise exception 'export contém segredo';
  end if;
  if exists (select 1 from public.fin_data_export_parts where export_id=(select value from gov_ids where key='export') and sha256 <> encode(sha256(convert_to(content,'UTF8')),'hex')) then
    raise exception 'checksum do export diverge';
  end if;
  if (select manifest->>'organization_id' from public.fin_data_exports where id=(select value from gov_ids where key='export')) <> '00000000-0000-4000-8000-0000000d9101'
     or jsonb_array_length((select manifest->'datasets' from public.fin_data_exports where id=(select value from gov_ids where key='export'))) <> (select count(*) from public.fin_governance_export_datasets()) then
    raise exception 'manifesto incompleto';
  end if;
end $$;
reset role;
set role authenticated;
select pg_temp.as_user('05');
select pg_temp.expect_error(format($q$select public.fin_governance_export_manifest('%s')$q$, (select value from gov_ids where key='export')), 'forbidden');
select pg_temp.expect_error(format($q$select public.fin_governance_export_part('%s','rfqs')$q$, (select value from gov_ids where key='export')), 'forbidden');
select pg_temp.expect_error(format($q$select count(*) from public.fin_governance_export_parts('%s')$q$, (select value from gov_ids where key='export')), 'forbidden');
do $$ begin if exists (select 1 from public.fin_data_exports where organization_id='00000000-0000-4000-8000-0000000d9101') then raise exception 'outro tenant vê export'; end if; end $$;
select pg_temp.as_user('02');
select pg_temp.expect_error(format($q$select public.fin_governance_export_part('%s','rfqs')$q$, (select value from gov_ids where key='export')), 'forbidden');
select pg_temp.as_user('01');
do $$ begin
  if (public.fin_governance_export_manifest((select value from gov_ids where key='export'))->>'format') <> 'arandu-export'
     or public.fin_governance_export_part((select value from gov_ids where key='export'),'rfqs') !~ 'RFQ governança DEMO'
     or (select count(*) from public.fin_governance_export_parts((select value from gov_ids where key='export'))) <> jsonb_array_length(public.fin_governance_export_manifest((select value from gov_ids where key='export'))->'datasets') then
    raise exception 'download do admin falhou';
  end if;
end $$;
select pg_temp.expect_error(format($q$select public.fin_governance_export_part('%s','../../etc')$q$, (select value from gov_ids where key='export')), 'export not available');
reset role;
-- Export vencido fica inacessível e a cópia é apagada pelo job.
update public.fin_data_exports set expires_at = now() - interval '1 minute' where id=(select value from gov_ids where key='export_other');
set role authenticated;
select pg_temp.as_user('05');
select pg_temp.expect_error(format($q$select public.fin_governance_export_part('%s','rfqs')$q$, (select value from gov_ids where key='export_other')), 'export not available');
reset role;
select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','',false);
set role service_role;
select public.fin_governance_retention_run(false, 50, null, 'gov-run-exp');
do $$ begin
  if (select status from public.fin_data_exports where id=(select value from gov_ids where key='export_other')) <> 'expired'
     or exists (select 1 from public.fin_data_export_parts where export_id=(select value from gov_ids where key='export_other')) then
    raise exception 'export vencido não foi expirado';
  end if;
end $$;
-- Falha no build nunca marca ready: limite por conjunto estourado vira failed.
reset role;
set role authenticated;
select pg_temp.as_user('05');
insert into gov_ids select 'export_fail', public.fin_governance_request_export('00000000-0000-4000-8000-0000000d9102');
reset role;
select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','',false);
set role service_role;
select public.fin_governance_build_export(100);
do $$ begin
  if (select status || ':' || error_code from public.fin_data_exports where id=(select value from gov_ids where key='export_fail')) <> 'failed:export_too_large'
     or exists (select 1 from public.fin_data_export_parts where export_id=(select value from gov_ids where key='export_fail')) then
    raise exception 'export com falha deixou parte ou ficou pronto';
  end if;
end $$;
reset role;

-- 7. Offboarding: só admin da compradora; transições inválidas recusadas;
-- pedido duplicado devolve o mesmo; revogação idempotente.
set role authenticated;
select pg_temp.as_user('06');
select pg_temp.expect_error($q$select public.fin_governance_request_offboarding('00000000-0000-4000-8000-0000000d9101','Provedor tentando encerrar o cliente')$q$, 'forbidden');
select pg_temp.as_user('02');
select pg_temp.expect_error($q$select public.fin_governance_request_offboarding('00000000-0000-4000-8000-0000000d9101','Analista tentando encerrar o grupo')$q$, 'forbidden');
select pg_temp.as_user('05');
select pg_temp.expect_error($q$select public.fin_governance_request_offboarding('00000000-0000-4000-8000-0000000d9101','Outro tenant tentando encerrar')$q$, 'forbidden');
select pg_temp.as_user('01');
insert into gov_ids select 'off', public.fin_governance_request_offboarding('00000000-0000-4000-8000-0000000d9101','Encerramento do contrato de piloto');
do $$ begin if public.fin_governance_request_offboarding('00000000-0000-4000-8000-0000000d9101','Pedido repetido de encerramento') <> (select value from gov_ids where key='off') then raise exception 'offboarding duplicado'; end if; end $$;
select pg_temp.expect_error(format($q$select public.fin_governance_offboarding_action('%s','confirm_revocation','{"retention_days":30,"decision_reference":"DEC-1"}')$q$, (select value from gov_ids where key='off')), 'invalid offboarding transition');
select pg_temp.expect_error(format($q$select public.fin_governance_offboarding_action('%s','close')$q$, (select value from gov_ids where key='off')), 'invalid offboarding transition');
select public.fin_governance_offboarding_action((select value from gov_ids where key='off'), 'request_export');
select pg_temp.expect_error(format($q$select public.fin_governance_offboarding_action('%s','request_export')$q$, (select value from gov_ids where key='off')), 'invalid offboarding transition');
select pg_temp.as_user('05');
do $$ begin if exists (select 1 from public.fin_offboarding_requests where organization_id='00000000-0000-4000-8000-0000000d9101') then raise exception 'outro tenant observa offboarding'; end if; end $$;
select pg_temp.expect_error(format($q$select public.fin_governance_offboarding_action('%s','cancel')$q$, (select value from gov_ids where key='off')), 'forbidden');
reset role;
select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','',false);
set role service_role;
select public.fin_governance_build_export();
select public.fin_governance_offboarding_advance();
do $$ begin if (select status from public.fin_offboarding_requests where id=(select value from gov_ids where key='off')) <> 'export_ready' then raise exception 'offboarding não avançou com o export pronto'; end if; end $$;
reset role;
set role authenticated;
select pg_temp.as_user('01');
select pg_temp.expect_error(format($q$select public.fin_governance_offboarding_action('%s','confirm_revocation','{"retention_days":30}')$q$, (select value from gov_ids where key='off')), 'invalid offboarding');
select pg_temp.expect_error(format($q$select public.fin_governance_offboarding_action('%s','confirm_revocation','{"retention_days":9999,"decision_reference":"DEC-1"}')$q$, (select value from gov_ids where key='off')), 'invalid offboarding');
do $$ begin
  if public.fin_governance_offboarding_action((select value from gov_ids where key='off'), 'confirm_revocation', '{"retention_days":0,"decision_reference":"DEC-2026-10"}') <> 'retention_window' then
    raise exception 'revogação não levou à janela de retenção';
  end if;
end $$;
-- O admin revogado perde tudo, inclusive o download do export.
do $$ begin if exists (select 1 from public.fin_offboarding_requests) or exists (select 1 from public.fin_rfqs where organization_id='00000000-0000-4000-8000-0000000d9101') then raise exception 'membro revogado ainda lê dados'; end if; end $$;
select pg_temp.expect_error(format($q$select public.fin_governance_export_manifest('%s')$q$, (select value from gov_ids where key='export')), 'forbidden');
select pg_temp.expect_error($q$select public.fin_governance_request_export('00000000-0000-4000-8000-0000000d9101')$q$, 'forbidden');
reset role;
do $$
declare r public.fin_offboarding_requests%rowtype;
begin
  select * into r from public.fin_offboarding_requests where id=(select value from gov_ids where key='off');
  if (r.revocation->>'members')::integer <> 4 or (r.revocation->>'service_accounts')::integer <> 1 or (r.revocation->>'api_credentials')::integer <> 1
     or (r.revocation->>'webhooks')::integer <> 1 or (r.revocation->>'sso_connections')::integer <> 1 or (r.revocation->>'member_invitations')::integer <> 1 then
    raise exception 'revogação incompleta: %', r.revocation;
  end if;
  if exists (select 1 from public.fin_members where organization_id='00000000-0000-4000-8000-0000000d9101')
     or (select count(*) from public.fin_offboarding_member_archive where request_id=r.id) <> 4
     or exists (select 1 from public.fin_service_accounts where organization_id='00000000-0000-4000-8000-0000000d9101' and status <> 'revoked')
     or exists (select 1 from public.fin_api_credentials where organization_id='00000000-0000-4000-8000-0000000d9101' and revoked_at is null)
     or exists (select 1 from public.fin_webhook_endpoints where organization_id='00000000-0000-4000-8000-0000000d9101' and status = 'active')
     or exists (select 1 from public.fin_webhook_deliveries where organization_id='00000000-0000-4000-8000-0000000d9101' and status in ('pending','failed','delivering'))
     or exists (select 1 from public.fin_sso_connections where organization_id='00000000-0000-4000-8000-0000000d9101' and (status <> 'disabled' or sessions_valid_after is null)) then
    raise exception 'revogação não alcançou todos os acessos';
  end if;
  -- Nada de negócio apagado: RFQ, eventos e o próprio grupo continuam.
  if not exists (select 1 from public.fin_rfqs where id='00000000-0000-4000-8000-0000000d9301')
     or not exists (select 1 from public.fin_organizations where id='00000000-0000-4000-8000-0000000d9101')
     or not exists (select 1 from public.fin_events where organization_id='00000000-0000-4000-8000-0000000d9101' and event_type='access_revoked') then
    raise exception 'offboarding apagou registro de negócio';
  end if;
end $$;
-- Conta de serviço revogada não autentica mais na API.
set role service_role;
select pg_temp.expect_error($q$select public.fin_api_context(repeat('0d9f',16), 'rfqs:read')$q$, 'api unauthorized');
-- Revogação repetida não muda nada nem duplica.
do $$ declare v jsonb := public.fin_governance_revoke_org_access((select value from gov_ids where key='off'));
begin
  if exists (select 1 from jsonb_each_text(v) e where e.value <> '0') then raise exception 'revogação repetida alterou algo: %', v; end if;
end $$;
reset role;
-- Organização travada: nenhum vínculo novo, nenhum aviso novo.
select pg_temp.expect_error($q$insert into public.fin_members(organization_id,user_id,role) values ('00000000-0000-4000-8000-0000000d9101','00000000-0000-4000-8000-0000000d9007','admin')$q$, 'organization offboarding');
insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body) values
('00000000-0000-4000-8000-0000000d9101','00000000-0000-4000-8000-0000000d9002','task_assigned','task',gen_random_uuid(),gen_random_uuid(),'Pós-offboarding','corpo');
do $$ begin if exists (select 1 from public.fin_notifications where title='Pós-offboarding') then raise exception 'aviso criado em organização travada'; end if; end $$;
-- Hold bloqueia agendamento da exclusão; liberado, o job agenda; fechar exige
-- operador e banco sem dado remanescente.
insert into public.fin_legal_holds(organization_id,scope_type,reason,created_by) values
('00000000-0000-4000-8000-0000000d9101','organization','Hold posterior ao offboarding','00000000-0000-4000-8000-0000000d9001');
select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','',false);
set role service_role;
do $$ begin
  if (public.fin_governance_offboarding_advance()->>'held')::integer <> 1
     or (select status from public.fin_offboarding_requests where id=(select value from gov_ids where key='off')) <> 'retention_window' then
    raise exception 'hold não bloqueou a exclusão agendada';
  end if;
end $$;
reset role;
update public.fin_legal_holds set status='released', released_at=now(), released_by='00000000-0000-4000-8000-0000000d9001'
 where organization_id='00000000-0000-4000-8000-0000000d9101' and status='active';
set role service_role;
select public.fin_governance_offboarding_advance();
do $$ begin if (select status from public.fin_offboarding_requests where id=(select value from gov_ids where key='off')) <> 'scheduled_for_deletion' then raise exception 'exclusão não agendada'; end if; end $$;
reset role;
set role authenticated;
select pg_temp.as_user('01');
select pg_temp.expect_error(format($q$select public.fin_governance_offboarding_close('%s','EVID-1')$q$, (select value from gov_ids where key='off')), 'forbidden');
reset role;
select pg_temp.as_ops();
set role authenticated;
select pg_temp.expect_error(format($q$select public.fin_governance_offboarding_close('%s','EVID-1')$q$, (select value from gov_ids where key='off')), 'tenant data remains');
do $$ begin if (public.fin_governance_deletion_preview('00000000-0000-4000-8000-0000000d9101')->>'remaining_rows')::bigint = 0 then raise exception 'prévia de exclusão vazia'; end if; end $$;
select public.fin_governance_offboarding_operator_cancel((select value from gov_ids where key='off'));
reset role;
select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','',false);
do $$ begin
  if (select status from public.fin_offboarding_requests where id=(select value from gov_ids where key='off')) <> 'cancelled'
     or exists (select 1 from public.fin_events where entity_type in ('offboarding','data_export','legal_hold','retention_policy')
                 and metadata::text ~ '(example\.invalid|token|secret|RFQ governança)') then
    raise exception 'offboarding/trilha de governança incorretos';
  end if;
  if (select array_agg(distinct event_type order by event_type) from public.fin_events where organization_id='00000000-0000-4000-8000-0000000d9101'
        and entity_type in ('offboarding','data_export','legal_hold','retention_policy'))
     @> array['access_revoked','deletion_scheduled','export_completed','export_downloaded','export_requested','legal_hold_created','legal_hold_released',
              'offboarding_cancelled','offboarding_requested','offboarding_transition','retention_policy_activated','retention_policy_created','retention_purged'] is not true then
    raise exception 'eventos de governança faltando';
  end if;
end $$;
-- Fila do job de governança registrada em fin_job_runs (fencing P0.10).
set role service_role;
do $$ declare v jsonb := public.fin_job_begin('retention','gov-job-1',now());
begin
  if v is null or not public.fin_job_finish((v->>'run_id')::uuid,(v->>'lease_token')::uuid,'succeeded',3,0,null) then raise exception 'job retention não registrado'; end if;
end $$;
reset role;
-- 8. Minimização da trilha (P0.11 #25): depois de todas as suítes, nenhum
-- evento, payload de webhook ou trilha de governança guarda token, segredo,
-- e-mail, URL privada, termo financeiro, corpo bruto ou asserção de SSO.
do $$
declare v_bad text;
begin
  select string_agg(distinct k, ', ') into v_bad from public.fin_events e, jsonb_object_keys(e.metadata) k
   where k ~* '(token|secret|password|email|phone|url|assertion|saml)'
      or k in ('body','terms','interest_rate','mdr','offered_amount','cost_summary','main_conditions','demand','payload','content','snapshot');
  if v_bad is not null then raise exception 'trilha guarda campo sensível: %', v_bad; end if;
  if exists (select 1 from public.fin_events where metadata::text ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}')
     or exists (select 1 from public.fin_webhook_events where payload::text ~* '([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|https?://)') then
    raise exception 'trilha guarda e-mail ou URL';
  end if;
end $$;
select 'financial data governance ok';

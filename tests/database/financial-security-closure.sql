\set ON_ERROR_STOP on
-- Fechamento de segurança (docs/supabase-financial-security-closure.sql).
-- Cada bloco reprova no schema anterior à migration.
--
-- Pessoas: d501 admin do grupo   d502 gestão financeira só entidade A
--          d503 gestão financeira do grupo   d504 admin de outra empresa
insert into auth.users(id,email) values
('00000000-0000-4000-8000-00000000d501','sc-admin@example.invalid'),
('00000000-0000-4000-8000-00000000d502','sc-manager-a@example.invalid'),
('00000000-0000-4000-8000-00000000d503','sc-manager-group@example.invalid'),
('00000000-0000-4000-8000-00000000d504','sc-other-admin@example.invalid')
on conflict(id) do nothing;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-00000000d511','Grupo fechamento DEMO','BUYER','00000000-0000-4000-8000-00000000d501'),
('00000000-0000-4000-8000-00000000d512','Outra empresa fechamento DEMO','BUYER','00000000-0000-4000-8000-00000000d504');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-00000000d511','00000000-0000-4000-8000-00000000d501','admin'),
('00000000-0000-4000-8000-00000000d511','00000000-0000-4000-8000-00000000d502','finance_manager'),
('00000000-0000-4000-8000-00000000d511','00000000-0000-4000-8000-00000000d503','finance_manager'),
('00000000-0000-4000-8000-00000000d512','00000000-0000-4000-8000-00000000d504','admin');
insert into public.fin_legal_entities(id,organization_id,kind,parent_id,legal_name,currency,created_by) values
('00000000-0000-4000-8000-00000000d521','00000000-0000-4000-8000-00000000d511','legal_entity',null,'Fechamento A Ltda DEMO','BRL','00000000-0000-4000-8000-00000000d501'),
('00000000-0000-4000-8000-00000000d522','00000000-0000-4000-8000-00000000d511','legal_entity',null,'Fechamento B Ltda DEMO','BRL','00000000-0000-4000-8000-00000000d501');
update public.fin_members set entity_scope='entities' where user_id='00000000-0000-4000-8000-00000000d502';
insert into public.fin_member_entity_grants(organization_id,user_id,entity_id,granted_by) values
('00000000-0000-4000-8000-00000000d511','00000000-0000-4000-8000-00000000d502','00000000-0000-4000-8000-00000000d521','00000000-0000-4000-8000-00000000d501');
insert into public.fin_rfqs(id,organization_id,product,title,owner_id,status,demand,legal_entity_id) values
('00000000-0000-4000-8000-00000000d531','00000000-0000-4000-8000-00000000d511','credit','Fechamento RFQ A DEMO','00000000-0000-4000-8000-00000000d501','draft','{}','00000000-0000-4000-8000-00000000d521'),
('00000000-0000-4000-8000-00000000d532','00000000-0000-4000-8000-00000000d511','credit','Fechamento RFQ B DEMO','00000000-0000-4000-8000-00000000d501','draft','{}','00000000-0000-4000-8000-00000000d522');
insert into public.fin_documents(id,organization_id,entity_type,entity_id,title,reference_url,note,created_by) values
('00000000-0000-4000-8000-00000000d541','00000000-0000-4000-8000-00000000d511','rfq','00000000-0000-4000-8000-00000000d531','Minuta A DEMO','https://docs.example.invalid/a','nota A','00000000-0000-4000-8000-00000000d501'),
('00000000-0000-4000-8000-00000000d542','00000000-0000-4000-8000-00000000d511','rfq','00000000-0000-4000-8000-00000000d532','Minuta B DEMO','https://docs.example.invalid/b','nota confidencial B','00000000-0000-4000-8000-00000000d501');
insert into public.fin_private_documents(id,organization_id,buyer_organization_id,entity_type,entity_id,rfq_id,title,visibility,created_by) values
('00000000-0000-4000-8000-00000000d551','00000000-0000-4000-8000-00000000d511','00000000-0000-4000-8000-00000000d511','rfq','00000000-0000-4000-8000-00000000d532','00000000-0000-4000-8000-00000000d532','Privado B DEMO','internal','00000000-0000-4000-8000-00000000d501');
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
('00000000-0000-4000-8000-00000000d561','00000000-0000-4000-8000-00000000d511','Banco fechamento DEMO','bank','00000000-0000-4000-8000-00000000d501');

-- A falha esperada é conferida fora do bloco de captura: a própria exceção
-- "não falhou" nunca conta como a falha esperada.
create or replace function pg_temp.sc_expect_error(p_sql text, p_message text) returns void language plpgsql as $$
declare v_error text;
begin
  begin
    execute p_sql;
  exception when others then v_error := sqlerrm;
  end;
  if v_error is null then raise exception 'esperava falha em: %', p_sql; end if;
  if v_error not like '%' || p_message || '%' then raise exception 'falha inesperada em %: % (esperava %)', p_sql, v_error, p_message; end if;
end $$;
grant execute on function pg_temp.sc_expect_error(text, text) to authenticated;

-- 1. fin_documents respeita a entidade em leitura e inserção.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000d502',false);
do $$ begin
  if exists (select 1 from public.fin_documents where id = '00000000-0000-4000-8000-00000000d542') then raise exception 'referência da entidade B visível para quem só alcança A'; end if;
  if not exists (select 1 from public.fin_documents where id = '00000000-0000-4000-8000-00000000d541') then raise exception 'referência da própria entidade sumiu'; end if;
end $$;
select pg_temp.sc_expect_error($q$insert into public.fin_documents(organization_id,entity_type,entity_id,title,reference_url,created_by)
  values ('00000000-0000-4000-8000-00000000d511','rfq','00000000-0000-4000-8000-00000000d532','Anexo intruso DEMO','https://docs.example.invalid/x','00000000-0000-4000-8000-00000000d502')$q$, 'row-level security');
insert into public.fin_documents(organization_id,entity_type,entity_id,title,reference_url,created_by)
  values ('00000000-0000-4000-8000-00000000d511','rfq','00000000-0000-4000-8000-00000000d531','Anexo legítimo DEMO','https://docs.example.invalid/ok','00000000-0000-4000-8000-00000000d502');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000d503',false);
do $$ begin
  if (select count(*) from public.fin_documents where organization_id = '00000000-0000-4000-8000-00000000d511') <> 3 then raise exception 'escopo de grupo deixou de ver todas as referências'; end if;
end $$;

-- 2. Remover documento privado exige alcançá-lo.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000d502',false);
select pg_temp.sc_expect_error($q$select public.fin_document_remove('00000000-0000-4000-8000-00000000d551')$q$, 'forbidden');
reset role;
do $$ begin
  if (select removed_at from public.fin_private_documents where id = '00000000-0000-4000-8000-00000000d551') is not null then raise exception 'documento de outra entidade removido'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000d503',false);
select public.fin_document_remove('00000000-0000-4000-8000-00000000d551');

-- 3. fin_providers: evidência e vínculo canônico só pelas RPCs.
reset role;
do $$ begin
  if has_column_privilege('authenticated','public.fin_providers','verification_state','UPDATE')
     or has_column_privilege('authenticated','public.fin_providers','regulator_checked_at','UPDATE')
     or has_column_privilege('authenticated','public.fin_providers','provider_organization_id','UPDATE')
     or has_column_privilege('authenticated','public.fin_providers','organization_id','UPDATE')
     or has_column_privilege('authenticated','public.fin_providers','created_by','UPDATE')
     or has_column_privilege('authenticated','public.fin_providers','verification_state','INSERT')
     or has_column_privilege('authenticated','public.fin_providers','provider_organization_id','INSERT') then
    raise exception 'coluna de evidência ou vínculo gravável diretamente';
  end if;
  if not has_column_privilege('authenticated','public.fin_providers','name','UPDATE')
     or not has_column_privilege('authenticated','public.fin_providers','contact_email','INSERT') then
    raise exception 'campos cadastrais deixaram de ser graváveis';
  end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000d503',false);
select pg_temp.sc_expect_error($q$update public.fin_providers set verification_state = 'EVIDENCIA_REGISTRADA', regulator_authority = 'BCB',
  regulator_evidence_url = 'https://bcb.example.invalid', regulator_checked_at = '2030-01-01' where id = '00000000-0000-4000-8000-00000000d561'$q$, 'permission denied');
update public.fin_providers set notes = 'Contato revisado DEMO', updated_at = now() where id = '00000000-0000-4000-8000-00000000d561';
insert into public.fin_providers(organization_id,name,kind,contact_email,products,created_by)
  values ('00000000-0000-4000-8000-00000000d511','Banco novo fechamento DEMO','bank','contato@banco.example.invalid','{credit}','00000000-0000-4000-8000-00000000d503');
reset role;
do $$ begin
  if (select verification_state from public.fin_providers where id = '00000000-0000-4000-8000-00000000d561') <> 'NAO_VERIFICADO' then raise exception 'evidência gravada sem RPC'; end if;
end $$;

-- 4. Prontidão de qualificação fora do alcance direto.
do $$ begin
  if has_function_privilege('authenticated','public.fin_qualification_readiness(uuid)','EXECUTE') then raise exception 'prontidão de qualificação executável por qualquer usuário'; end if;
end $$;

-- 5. Webhooks da API v1 respeitam o escopo de entidade da conta de serviço.
insert into public.fin_service_accounts(id,organization_id,name,scopes,entity_scope,created_by) values
('00000000-0000-4000-8000-00000000d571','00000000-0000-4000-8000-00000000d511','Integração só A DEMO','{webhooks:manage}','entities','00000000-0000-4000-8000-00000000d501'),
('00000000-0000-4000-8000-00000000d572','00000000-0000-4000-8000-00000000d511','Integração do grupo DEMO','{webhooks:manage}','group','00000000-0000-4000-8000-00000000d501');
insert into public.fin_service_account_entities(organization_id,service_account_id,entity_id,granted_by) values
('00000000-0000-4000-8000-00000000d511','00000000-0000-4000-8000-00000000d571','00000000-0000-4000-8000-00000000d521','00000000-0000-4000-8000-00000000d501');
insert into public.fin_api_credentials(organization_id,service_account_id,token_prefix,token_hash,created_by,expires_at) values
('00000000-0000-4000-8000-00000000d511','00000000-0000-4000-8000-00000000d571','arnd_test_scAAAA',encode(sha256('security-closure-a'::bytea),'hex'),'00000000-0000-4000-8000-00000000d501',now()+interval '1 day'),
('00000000-0000-4000-8000-00000000d511','00000000-0000-4000-8000-00000000d572','arnd_test_scGGGG',encode(sha256('security-closure-g'::bytea),'hex'),'00000000-0000-4000-8000-00000000d501',now()+interval '1 day');
insert into public.fin_webhook_endpoints(id,organization_id,url,events,entity_ids,secret_ciphertext,created_by_user) values
('00000000-0000-4000-8000-00000000d581','00000000-0000-4000-8000-00000000d511','https://hooks.example.invalid/grupo','{rfq.created}',null,'v1.aaaa.bbbb.cccc','00000000-0000-4000-8000-00000000d501'),
('00000000-0000-4000-8000-00000000d582','00000000-0000-4000-8000-00000000d511','https://hooks.example.invalid/a','{rfq.created}','{00000000-0000-4000-8000-00000000d521}','v1.aaaa.bbbb.cccc','00000000-0000-4000-8000-00000000d501');
set role service_role;
do $$
declare v_a text := encode(sha256('security-closure-a'::bytea),'hex'); v_g text := encode(sha256('security-closure-g'::bytea),'hex'); v jsonb;
begin
  v := public.fin_api_list_webhooks(v_a);
  if jsonb_array_length(v) <> 1 or v->0->>'id' <> '00000000-0000-4000-8000-00000000d582' then raise exception 'conta limitada vê webhook do grupo: %', v; end if;
  if jsonb_array_length(public.fin_api_list_webhooks(v_g)) <> 2 then raise exception 'conta do grupo deixou de ver todos os webhooks'; end if;
  begin perform public.fin_api_disable_webhook(v_a, '00000000-0000-4000-8000-00000000d581'); raise exception 'conta limitada desativou webhook do grupo';
  exception when others then if sqlerrm <> 'api not found' then raise; end if; end;
  begin perform public.fin_api_list_deliveries(v_a, '00000000-0000-4000-8000-00000000d581'); raise exception 'conta limitada leu entregas do grupo';
  exception when others then if sqlerrm <> 'api not found' then raise; end if; end;
  perform public.fin_api_list_deliveries(v_a, '00000000-0000-4000-8000-00000000d582');
  perform public.fin_api_disable_webhook(v_a, '00000000-0000-4000-8000-00000000d582');
end $$;
reset role;
do $$ begin
  if (select status from public.fin_webhook_endpoints where id = '00000000-0000-4000-8000-00000000d581') <> 'active' then raise exception 'webhook do grupo desativado'; end if;
  if (select status from public.fin_webhook_endpoints where id = '00000000-0000-4000-8000-00000000d582') <> 'disabled' then raise exception 'webhook da própria entidade não desativou'; end if;
  if has_function_privilege('authenticated','public.fin_api_endpoint_allowed(jsonb,uuid[])','EXECUTE') then raise exception 'auxiliar de escopo exposta'; end if;
end $$;

-- 6. Pedido de domínio SSO pendente não bloqueia o domínio para sempre.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000d504',false);
select public.fin_sso_claim_domain('00000000-0000-4000-8000-00000000d512','fechamento-dono.example.com',repeat('1',64));
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000d501',false);
select pg_temp.sc_expect_error($q$select public.fin_sso_claim_domain('00000000-0000-4000-8000-00000000d511','fechamento-dono.example.com',repeat('2',64))$q$, 'sso domain unavailable');
reset role;
update public.fin_sso_domains set created_at = now() - interval '8 days' where domain = 'fechamento-dono.example.com';
set role authenticated;
select public.fin_sso_claim_domain('00000000-0000-4000-8000-00000000d511','fechamento-dono.example.com',repeat('2',64));
reset role;
do $$ begin
  if (select organization_id from public.fin_sso_domains where domain = 'fechamento-dono.example.com') <> '00000000-0000-4000-8000-00000000d511'
     or (select verification_token_hash from public.fin_sso_domains where domain = 'fechamento-dono.example.com') <> repeat('2',64) then
    raise exception 'pedido pendente vencido não foi assumido';
  end if;
end $$;
-- Verificado continua indisponível para outra organização.
update public.fin_sso_domains set status = 'verified', verified_at = now() - interval '30 days', created_at = now() - interval '30 days' where domain = 'fechamento-dono.example.com';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000d504',false);
select pg_temp.sc_expect_error($q$select public.fin_sso_claim_domain('00000000-0000-4000-8000-00000000d512','fechamento-dono.example.com',repeat('3',64))$q$, 'sso domain unavailable');
reset role;
select set_config('request.jwt.claim.sub','',false);

do $$ begin
  if (select value from public.fin_settings where key = 'schema_version') not in ('financial-security-closure-1', 'financial-request-receipts-1', 'financial-followup-hardening-1', 'financial-contract-onboarding-1', 'financial-renewal-cycles-1', 'financial-decision-integrity-1', 'financial-session-revocation-1', 'financial-document-upload-authorization-1', 'financial-implementation-task-labels-1', 'financial-task-accountability-1', 'financial-enterprise-integrity-1', 'financial-decision-authorization-1', 'financial-external-proposals-1') then raise exception 'marcador de schema'; end if;
end $$;
\echo 'Fechamento de segurança: referências por entidade, remoção com alcance, evidência só por RPC, prontidão fechada, webhooks por escopo e domínio SSO pendente que vence validados.'

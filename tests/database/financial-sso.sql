\set ON_ERROR_STOP on
-- Enterprise SSO foundation (docs/supabase-financial-sso.sql): conexão por
-- organização, domínio com verificação, descoberta, ativação com pré-requisitos,
-- autorização pós-login com motivos estáveis (domínio, organização, membro,
-- sessão expirada/revogada, membro bloqueado), exigência de SSO e negações.
-- Pessoas ...0000000c90NN: 01 admin G · 02 analista G · 03 admin O (outro tenant)
--   04 pessoa do domínio sem vínculo · 05 membro bloqueado
insert into auth.users(id,email) values
('00000000-0000-4000-8000-0000000c9001','sso-admin@example.invalid'),
('00000000-0000-4000-8000-0000000c9002','analista@vitta-sso.example'),
('00000000-0000-4000-8000-0000000c9003','sso-other@example.invalid'),
('00000000-0000-4000-8000-0000000c9004','estranho@vitta-sso.example'),
('00000000-0000-4000-8000-0000000c9005','bloqueado@vitta-sso.example')
on conflict(id) do nothing;
update auth.users set banned_until = now() + interval '1 day' where id = '00000000-0000-4000-8000-0000000c9005';
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-0000000c9101','Grupo SSO DEMO','BUYER','00000000-0000-4000-8000-0000000c9001'),
('00000000-0000-4000-8000-0000000c9102','Outro SSO DEMO','BUYER','00000000-0000-4000-8000-0000000c9003');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-0000000c9101','00000000-0000-4000-8000-0000000c9001','admin'),
('00000000-0000-4000-8000-0000000c9101','00000000-0000-4000-8000-0000000c9002','analyst'),
('00000000-0000-4000-8000-0000000c9101','00000000-0000-4000-8000-0000000c9005','viewer'),
('00000000-0000-4000-8000-0000000c9102','00000000-0000-4000-8000-0000000c9003','admin');

create temporary table sso_ids(key text primary key, value uuid);
grant all on sso_ids to authenticated, service_role;
create or replace function pg_temp.expect_error(p_sql text, p_message text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'esperava falha "%" em: %', p_message, p_sql;
exception when others then
  if sqlerrm not like p_message || '%' then raise exception 'falha inesperada em %: % (esperava %)', p_sql, sqlerrm, p_message; end if;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated, service_role;
create or replace function pg_temp.as_user(p_suffix text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000c90' || p_suffix, false);
$$;
grant execute on function pg_temp.as_user(text) to authenticated, service_role;

-- 1. Superfície: borda de login só com service role; hash de verificação ilegível.
do $$ begin
  if has_function_privilege('authenticated','public.fin_sso_authorize(uuid,uuid,text,text,timestamp with time zone)','EXECUTE')
     or has_function_privilege('authenticated','public.fin_sso_discover(text)','EXECUTE')
     or has_function_privilege('authenticated','public.fin_sso_mark_domain_verified(text,text)','EXECUTE')
     or has_function_privilege('anon','public.fin_sso_password_allowed(text)','EXECUTE')
     or has_column_privilege('authenticated','public.fin_sso_domains','verification_token_hash','SELECT')
     or has_table_privilege('authenticated','public.fin_sso_connections','INSERT') then
    raise exception 'superfície de SSO exposta ao cliente';
  end if;
end $$;

-- 2. Administração: só admin; domínio pessoal recusado; domínio de outro grupo indisponível.
set role authenticated;
select pg_temp.as_user('02');
select pg_temp.expect_error($q$select public.fin_sso_save_connection('00000000-0000-4000-8000-0000000c9101',null,'saml','supabase','Entra ID',null,null,null,null,null,12)$q$, 'forbidden');
select pg_temp.as_user('01');
select pg_temp.expect_error($q$select public.fin_sso_save_connection('00000000-0000-4000-8000-0000000c9101',null,'ldap','supabase','LDAP',null,null,null,null,null,12)$q$, 'invalid sso connection');
select pg_temp.expect_error($q$select public.fin_sso_save_connection('00000000-0000-4000-8000-0000000c9101',null,'saml','supabase','Entra',null,null,null,'http://idp.example/metadata',null,12)$q$, 'invalid sso connection');
select pg_temp.expect_error($q$select public.fin_sso_save_connection('00000000-0000-4000-8000-0000000c9101',null,'saml','supabase','Entra',null,null,null,null,'{"name":"displayName"}'::jsonb,12)$q$, 'invalid sso connection');
insert into sso_ids select 'conn', public.fin_sso_save_connection('00000000-0000-4000-8000-0000000c9101', null, 'saml', 'supabase', 'Microsoft Entra ID',
  'sso:7f6c2a1e-0000-4000-8000-000000000001', null, null, 'https://login.microsoftonline.com/tenant/federationmetadata/2007-06/federationmetadata.xml', null, 8);
insert into sso_ids select 'mock', public.fin_sso_save_connection('00000000-0000-4000-8000-0000000c9101', null, 'oidc', 'mock', 'IdP de teste',
  'mock:idp', 'https://idp.mock.example', 'arandu-test', 'https://idp.mock.example/.well-known/openid-configuration', null, 4);
select pg_temp.expect_error($q$select public.fin_sso_claim_domain('00000000-0000-4000-8000-0000000c9101','gmail.com','$q$ || repeat('a',64) || $q$')$q$, 'invalid sso domain');
select pg_temp.expect_error($q$select public.fin_sso_claim_domain('00000000-0000-4000-8000-0000000c9101','não é domínio','$q$ || repeat('a',64) || $q$')$q$, 'invalid sso domain');
select public.fin_sso_claim_domain('00000000-0000-4000-8000-0000000c9101', 'Vitta-SSO.example', repeat('a',64));
-- Sem domínio verificado não testa nem ativa.
select pg_temp.expect_error(format($q$select public.fin_sso_set_status('%s','testing')$q$, (select value from sso_ids where key='conn')), 'sso domain not verified');
select pg_temp.as_user('03');
select pg_temp.expect_error($q$select public.fin_sso_claim_domain('00000000-0000-4000-8000-0000000c9102','vitta-sso.example','$q$ || repeat('b',64) || $q$')$q$, 'sso domain unavailable');
do $$ begin if exists (select 1 from public.fin_sso_connections) or exists (select 1 from public.fin_sso_domains) then raise exception 'outro tenant vê SSO'; end if; end $$;
select pg_temp.as_user('02');
do $$ begin if exists (select 1 from public.fin_sso_connections) then raise exception 'não admin vê SSO'; end if; end $$;

-- 3. Verificação do domínio: só o servidor (service role) com o token certo.
select pg_temp.as_user('01');
select pg_temp.expect_error($q$select public.fin_sso_mark_domain_verified('vitta-sso.example','$q$ || repeat('a',64) || $q$')$q$, 'permission denied');
reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;
select pg_temp.expect_error($q$select public.fin_sso_mark_domain_verified('vitta-sso.example','$q$ || repeat('c',64) || $q$')$q$, 'sso domain not verified');
select public.fin_sso_mark_domain_verified('vitta-sso.example', repeat('a',64));
do $$ begin if public.fin_sso_discover('vitta-sso.example') is not null then raise exception 'descoberta sem conexão ligada'; end if; end $$;
reset role;

-- 4. Liga domínio, testa; mock nunca ativa; ativar exige login de teste bem-sucedido.
set role authenticated;
select pg_temp.as_user('01');
select public.fin_sso_link_domain('vitta-sso.example', (select value from sso_ids where key='conn'));
select pg_temp.expect_error(format($q$select public.fin_sso_set_status('%s','testing',true)$q$, (select value from sso_ids where key='conn')), 'invalid sso connection');
select public.fin_sso_set_status((select value from sso_ids where key='conn'), 'testing');
select pg_temp.expect_error(format($q$select public.fin_sso_set_status('%s','active')$q$, (select value from sso_ids where key='conn')), 'sso test login required');
select pg_temp.expect_error(format($q$select public.fin_sso_set_status('%s','active')$q$, (select value from sso_ids where key='mock')), 'sso domain not verified');
reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;
do $$
declare v jsonb;
begin
  v := public.fin_sso_discover('VITTA-SSO.example');
  if v->>'connection_id' <> (select value::text from sso_ids where key='conn') or v->>'status' <> 'testing' or (v->>'enforce')::boolean then raise exception 'descoberta: %', v; end if;
  if public.fin_sso_discover('desconhecido.example') is not null then raise exception 'tenant não configurado deveria ser nulo'; end if;
  -- Sucesso: membro do grupo, domínio certo, provedor certo, sessão recente.
  v := public.fin_sso_authorize((select value from sso_ids where key='conn'), '00000000-0000-4000-8000-0000000c9002', 'analista@vitta-sso.example',
       'sso:7f6c2a1e-0000-4000-8000-000000000001', now() - interval '1 minute');
  if v->>'organization_id' <> '00000000-0000-4000-8000-0000000c9101' or v->>'role' <> 'analyst' or (v->>'max_session_hours')::int <> 8 then raise exception 'autorização: %', v; end if;
  perform public.fin_record_sso_event((select value from sso_ids where key='conn'), 'success', 'ok', 'vitta-sso.example', repeat('d',64), 'corr-sso-0001');
end $$;
-- Negações com motivo estável.
select pg_temp.expect_error(format($q$select public.fin_sso_authorize('%s','00000000-0000-4000-8000-0000000c9002','analista@vitta-sso.example','sso:outro-provedor',now())$q$, (select value from sso_ids where key='conn')), 'sso provider mismatch');
select pg_temp.expect_error(format($q$select public.fin_sso_authorize('%s','00000000-0000-4000-8000-0000000c9002','analista@outro.example','sso:7f6c2a1e-0000-4000-8000-000000000001',now())$q$, (select value from sso_ids where key='conn')), 'sso domain mismatch');
select pg_temp.expect_error(format($q$select public.fin_sso_authorize('%s','00000000-0000-4000-8000-0000000c9004','estranho@vitta-sso.example','sso:7f6c2a1e-0000-4000-8000-000000000001',now())$q$, (select value from sso_ids where key='conn')), 'sso member not found');
select pg_temp.expect_error(format($q$select public.fin_sso_authorize('%s','00000000-0000-4000-8000-0000000c9005','bloqueado@vitta-sso.example','sso:7f6c2a1e-0000-4000-8000-000000000001',now())$q$, (select value from sso_ids where key='conn')), 'sso member disabled');
select pg_temp.expect_error(format($q$select public.fin_sso_authorize('%s','00000000-0000-4000-8000-0000000c9002','analista@vitta-sso.example','sso:7f6c2a1e-0000-4000-8000-000000000001',now() - interval '9 hours')$q$, (select value from sso_ids where key='conn')), 'sso session expired');
select pg_temp.expect_error(format($q$select public.fin_sso_authorize('%s','00000000-0000-4000-8000-0000000c9002','analista@vitta-sso.example','mock:idp',now())$q$, (select value from sso_ids where key='mock')), 'sso connection inactive');
select pg_temp.expect_error($q$select public.fin_sso_authorize(gen_random_uuid(),'00000000-0000-4000-8000-0000000c9002','analista@vitta-sso.example','x',now())$q$, 'sso connection inactive');
reset role;

-- 5. Ativa com exigência de SSO: login por senha do domínio deixa de valer;
--    conexão ativa não é editada; revogação corta sessões anteriores.
set role authenticated;
select pg_temp.as_user('01');
select public.fin_sso_set_status((select value from sso_ids where key='conn'), 'active', true);
select pg_temp.expect_error(format($q$select public.fin_sso_save_connection('00000000-0000-4000-8000-0000000c9101','%s','saml','supabase','Outro nome','sso:x',null,null,'https://idp.example/m',null,12)$q$, (select value from sso_ids where key='conn')), 'sso connection active');
select public.fin_sso_revoke_sessions((select value from sso_ids where key='conn'));
select pg_temp.as_user('03');
select pg_temp.expect_error(format($q$select public.fin_sso_revoke_sessions('%s')$q$, (select value from sso_ids where key='conn')), 'forbidden');
select pg_temp.expect_error(format($q$select public.fin_sso_set_status('%s','disabled')$q$, (select value from sso_ids where key='conn')), 'forbidden');
reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;
do $$ begin
  if public.fin_sso_password_allowed('vitta-sso.example') then raise exception 'senha ainda permitida em domínio com SSO exigido'; end if;
  if not public.fin_sso_password_allowed('outro.example') then raise exception 'domínio sem SSO bloqueado'; end if;
end $$;
select pg_temp.expect_error(format($q$select public.fin_sso_authorize('%s','00000000-0000-4000-8000-0000000c9002','analista@vitta-sso.example','sso:7f6c2a1e-0000-4000-8000-000000000001',now() - interval '1 second')$q$, (select value from sso_ids where key='conn')), 'sso session revoked');
do $$ begin
  perform public.fin_sso_authorize((select value from sso_ids where key='conn'), '00000000-0000-4000-8000-0000000c9002', 'analista@vitta-sso.example', 'sso:7f6c2a1e-0000-4000-8000-000000000001', now() + interval '1 second');
end $$;
reset role;
-- Desativar devolve o login por senha; trilha completa.
set role authenticated;
select pg_temp.as_user('01');
select public.fin_sso_set_status((select value from sso_ids where key='conn'), 'disabled');
do $$ begin
  if not exists (select 1 from public.fin_sso_events where outcome = 'success' and email_domain = 'vitta-sso.example') then raise exception 'admin não vê a trilha'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;
do $$ begin if not public.fin_sso_password_allowed('vitta-sso.example') then raise exception 'desativar não devolveu a senha'; end if; end $$;
reset role;
do $$ begin
  if (select count(*) from public.fin_events where organization_id = '00000000-0000-4000-8000-0000000c9101' and event_type like 'sso_%') < 7 then raise exception 'trilha de SSO incompleta'; end if;
end $$;

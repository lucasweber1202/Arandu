\set ON_ERROR_STOP on
-- Hardening final: convite vinculado ao e-mail do destinatário e papel de
-- plataforma finance_ops (docs/supabase-financial-final-hardening.sql).
insert into auth.users(id,email,email_confirmed_at) values
('00000000-0000-4000-8000-000000001101','fh-buyer@example.invalid',now()),
('00000000-0000-4000-8000-000000001102','contato-a@banco-a.invalid',now()),
('00000000-0000-4000-8000-000000001103','colega@banco-a.invalid',now()),
('00000000-0000-4000-8000-000000001104','contato-b@banco-b.invalid',now()),
('00000000-0000-4000-8000-000000001105',null,null),
('00000000-0000-4000-8000-000000001106','contato-c@banco-c.invalid',null),
('00000000-0000-4000-8000-000000001107','legacy-operator@example.invalid',now()),
('00000000-0000-4000-8000-000000001108','finance-ops@example.invalid',now()),
('00000000-0000-4000-8000-000000001109','finance-ops-sem-registro@example.invalid',now())
on conflict(id) do nothing;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-000000001201','Compradora FH DEMO','BUYER','00000000-0000-4000-8000-000000001101'),
('00000000-0000-4000-8000-000000001202','Banco A FH DEMO','PROVIDER','00000000-0000-4000-8000-000000001102'),
('00000000-0000-4000-8000-000000001203','Banco B FH DEMO','PROVIDER','00000000-0000-4000-8000-000000001104'),
('00000000-0000-4000-8000-000000001204','Banco C FH DEMO','PROVIDER','00000000-0000-4000-8000-000000001106'),
('00000000-0000-4000-8000-000000001205','Correspondente FH DEMO','PROVIDER','00000000-0000-4000-8000-000000001105')
on conflict do nothing;
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-000000001201','00000000-0000-4000-8000-000000001101','admin'),
('00000000-0000-4000-8000-000000001202','00000000-0000-4000-8000-000000001102','provider_user'),
('00000000-0000-4000-8000-000000001202','00000000-0000-4000-8000-000000001103','provider_user'),
('00000000-0000-4000-8000-000000001203','00000000-0000-4000-8000-000000001104','provider_user'),
('00000000-0000-4000-8000-000000001204','00000000-0000-4000-8000-000000001106','provider_user'),
('00000000-0000-4000-8000-000000001205','00000000-0000-4000-8000-000000001105','provider_user')
on conflict do nothing;
insert into public.fin_providers(id,organization_id,name,kind,contact_email,created_by) values
('00000000-0000-4000-8000-000000001301','00000000-0000-4000-8000-000000001201','Banco A FH DEMO','bank',' Contato-A@Banco-A.invalid ','00000000-0000-4000-8000-000000001101'),
('00000000-0000-4000-8000-000000001302','00000000-0000-4000-8000-000000001201','Banco B FH DEMO','bank','contato-b@banco-b.invalid','00000000-0000-4000-8000-000000001101'),
('00000000-0000-4000-8000-000000001303','00000000-0000-4000-8000-000000001201','Correspondente FH DEMO','other',null,'00000000-0000-4000-8000-000000001101'),
('00000000-0000-4000-8000-000000001304','00000000-0000-4000-8000-000000001201','Banco C FH DEMO','bank','contato-c@banco-c.invalid','00000000-0000-4000-8000-000000001101')
on conflict do nothing;
insert into public.fin_rfqs(id,organization_id,product,title,status,owner_id,demand) values
('00000000-0000-4000-8000-000000001401','00000000-0000-4000-8000-000000001201','credit','RFQ FH DEMO','open','00000000-0000-4000-8000-000000001101','{}')
on conflict do nothing;
create temporary table fh_tokens(key text primary key, token text);
create temporary table fh_results(key text primary key, value uuid);
grant all on fh_tokens, fh_results to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001101',false);
insert into fh_tokens values
 ('a', public.fin_invite_provider('00000000-0000-4000-8000-000000001401','00000000-0000-4000-8000-000000001301')),
 ('b', public.fin_invite_provider('00000000-0000-4000-8000-000000001401','00000000-0000-4000-8000-000000001302')),
 ('open', public.fin_invite_provider('00000000-0000-4000-8000-000000001401','00000000-0000-4000-8000-000000001303')),
 ('c', public.fin_invite_provider('00000000-0000-4000-8000-000000001401','00000000-0000-4000-8000-000000001304'));
reset role;

do $$ begin
  if (select recipient_mode || ':' || recipient_email from public.fin_rfq_invites where provider_id='00000000-0000-4000-8000-000000001301')
     <> 'exact_email:contato-a@banco-a.invalid' then raise exception 'convite com contato não ficou vinculado ao e-mail normalizado'; end if;
  if (select recipient_mode from public.fin_rfq_invites where provider_id='00000000-0000-4000-8000-000000001303') <> 'organization_open'
     or (select recipient_email from public.fin_rfq_invites where provider_id='00000000-0000-4000-8000-000000001303') is not null
  then raise exception 'convite sem contato deveria ser organization_open explícito'; end if;
end $$;

-- Recusas: devolvem null (a API responde o erro genérico) e o convite continua válido.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001103',false);
insert into fh_results select 'colleague', public.fin_accept_provider_invite((select token from fh_tokens where key='a'),'00000000-0000-4000-8000-000000001202');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001104',false);
insert into fh_results select 'competitor', public.fin_accept_provider_invite((select token from fh_tokens where key='a'),'00000000-0000-4000-8000-000000001203');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001105',false);
insert into fh_results select 'no_email', public.fin_accept_provider_invite((select token from fh_tokens where key='a'),'00000000-0000-4000-8000-000000001205');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001106',false);
insert into fh_results select 'unconfirmed', public.fin_accept_provider_invite((select token from fh_tokens where key='c'),'00000000-0000-4000-8000-000000001204');
-- Destinatário certo (e-mail igual ao contato, sem diferenciar maiúsculas).
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001102',false);
insert into fh_results select 'recipient', public.fin_accept_provider_invite((select token from fh_tokens where key='a'),'00000000-0000-4000-8000-000000001202');
-- Token já usado.
do $$ begin
  perform public.fin_accept_provider_invite((select token from fh_tokens where key='a'),'00000000-0000-4000-8000-000000001202');
  raise exception 'convite reutilizado';
exception when others then if sqlerrm <> 'invalid invitation' then raise; end if; end $$;
-- Convite aberto: qualquer conta provedora com o link, inclusive sem e-mail.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001105',false);
insert into fh_results select 'open', public.fin_accept_provider_invite((select token from fh_tokens where key='open'),'00000000-0000-4000-8000-000000001205');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001104',false);
insert into fh_results select 'own_b', public.fin_accept_provider_invite((select token from fh_tokens where key='b'),'00000000-0000-4000-8000-000000001203');
reset role;

-- Expirado e revogado continuam recusados antes de qualquer outra regra.
update public.fin_rfq_invites set expires_at = now() - interval '1 minute' where provider_id='00000000-0000-4000-8000-000000001304';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001106',false);
do $$ begin
  perform public.fin_accept_provider_invite((select token from fh_tokens where key='c'),'00000000-0000-4000-8000-000000001204');
  raise exception 'convite expirado aceito';
exception when others then if sqlerrm <> 'invalid invitation' then raise; end if; end $$;
reset role;
update public.fin_rfq_invites set expires_at = now() + interval '1 day', status = 'revoked' where provider_id='00000000-0000-4000-8000-000000001304';
update auth.users set email_confirmed_at = now() where id='00000000-0000-4000-8000-000000001106';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001106',false);
do $$ begin
  perform public.fin_accept_provider_invite((select token from fh_tokens where key='c'),'00000000-0000-4000-8000-000000001204');
  raise exception 'convite revogado aceito';
exception when others then if sqlerrm <> 'invalid invitation' then raise; end if; end $$;
do $$ begin
  if has_table_privilege('authenticated','public.fin_invite_acceptance_denials','SELECT') then
    raise exception 'trilha de recusas legível pelo navegador';
  end if;
end $$;
reset role;

do $$ begin
  if exists (select 1 from fh_results where key in ('colleague','competitor','no_email','unconfirmed') and value is not null) then
    raise exception 'aceite recusado devolveu convite: %', (select string_agg(key, ',') from fh_results where key in ('colleague','competitor','no_email','unconfirmed') and value is not null);
  end if;
  if exists (select 1 from fh_results where key in ('recipient','open','own_b') and value is null) then
    raise exception 'aceite legítimo recusado';
  end if;
  if (select string_agg(reason, ',' order by reason) from public.fin_invite_acceptance_denials where rfq_id='00000000-0000-4000-8000-000000001401')
     <> 'email_unconfirmed,no_email,recipient_mismatch,recipient_mismatch' then
    raise exception 'motivos de recusa inesperados: %', (select string_agg(reason, ',' order by reason) from public.fin_invite_acceptance_denials where rfq_id='00000000-0000-4000-8000-000000001401');
  end if;
  if (select provider_organization_id from public.fin_rfq_invites where provider_id='00000000-0000-4000-8000-000000001301') <> '00000000-0000-4000-8000-000000001202'
  then raise exception 'convite de A não ficou com a conta A'; end if;
end $$;

-- --------------------------------------------------------------- finance_ops
insert into public.fin_platform_operators(user_id, granted_by) values
('00000000-0000-4000-8000-000000001107','teste: operador legado'),
('00000000-0000-4000-8000-000000001108','teste: finance_ops')
on conflict do nothing;
set role authenticated;
-- Operador legado (papel de arte) com MFA e registro: não abre o console financeiro.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001107',false);
select set_config('request.jwt.claim.app_metadata','{"arandu_role":"operator"}',false);
select set_config('request.jwt.claim.aal','aal2',false);
do $$ begin
  perform public.fin_ops_overview();
  raise exception 'operador legado abriu o console financeiro';
exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end $$;
do $$ begin if public.fin_is_operator() then raise exception 'operador legado reconhecido como finance_ops'; end if; end $$;
-- finance_ops sem registro em fin_platform_operators.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001109',false);
select set_config('request.jwt.claim.app_metadata','{"arandu_role":"finance_ops"}',false);
do $$ begin
  perform public.fin_ops_overview();
  raise exception 'finance_ops sem registro abriu o console';
exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end $$;
-- Admin de empresa com MFA.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001101',false);
select set_config('request.jwt.claim.app_metadata','{}',false);
do $$ begin
  perform public.fin_ops_overview();
  raise exception 'admin de empresa abriu o console';
exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end $$;
-- finance_ops registrado: sem MFA recusa, com MFA abre, vê recusas de convite sem e-mail.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001108',false);
select set_config('request.jwt.claim.app_metadata','{"arandu_role":"finance_ops"}',false);
select set_config('request.jwt.claim.aal','aal1',false);
do $$ begin
  perform public.fin_ops_overview();
  raise exception 'finance_ops sem MFA abriu o console';
exception when others then if sqlerrm not like '%mfa required%' then raise; end if; end $$;
select set_config('request.jwt.claim.aal','aal2',false);
do $$
declare v jsonb; t jsonb;
begin
  if not public.fin_is_operator() then raise exception 'finance_ops não reconhecido'; end if;
  v := public.fin_ops_overview();
  if v->>'schema_version' not in ('financial-final-hardening-1','financial-surface-hardening-1','financial-approval-handoff-1','financial-passport-1','financial-multi-entity-1', 'financial-contracts-v2-1', 'financial-relationships-portfolio-1', 'financial-passport-entities-1', 'financial-graph-1', 'financial-policy-engine-1', 'financial-public-api-1','financial-sso-1','financial-operational-resilience-1','financial-data-governance-1','financial-legacy-art-decommission-1','financial-p0-closure-1','financial-value-realization-1','financial-fee-intelligence-1') then raise exception 'versão do schema: %', v->>'schema_version'; end if;
  if coalesce((v->'invite_denials_24h'->>'recipient_mismatch')::int, 0) < 2 then raise exception 'recusas de convite não contadas'; end if;
  t := public.fin_ops_trace(null, '00000000-0000-4000-8000-000000001401');
  if jsonb_array_length(t->'invite_denials') < 4 then raise exception 'rastreio sem recusas de convite'; end if;
  if (v::text || t::text) ~* 'example\.invalid|banco-a|contato' then raise exception 'console expôs e-mail'; end if;
end $$;
select set_config('request.jwt.claim.aal','',false);
select set_config('request.jwt.claim.app_metadata','',false);
reset role;
drop table fh_tokens;
drop table fh_results;
\echo 'Invite recipient binding (exact e-mail, confirmed, generic refusal with internal audit) and finance_ops platform role (legacy operator, company admin and unregistered finance_ops denied; MFA required) validated.'

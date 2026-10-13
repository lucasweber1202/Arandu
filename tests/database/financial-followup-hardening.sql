\set ON_ERROR_STOP on
-- Pendências da PR #178 (docs/supabase-financial-followup-hardening.sql):
-- tetos e justiça da fila de e-mail e evidência de exceção de policy.
--
-- Pessoas: d801 admin da compradora A   d802 gestão financeira só entidade E1 de A
--          d803 usuário do provedor      d804 admin da compradora B
insert into auth.users(id,email) values
('00000000-0000-4000-8000-00000000d801','fu-admin-a@example.invalid'),
('00000000-0000-4000-8000-00000000d802','fu-manager-e1@example.invalid'),
('00000000-0000-4000-8000-00000000d803','fu-provider@example.invalid'),
('00000000-0000-4000-8000-00000000d804','fu-admin-b@example.invalid')
on conflict(id) do nothing;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-00000000d811','Compradora A fila DEMO','BUYER','00000000-0000-4000-8000-00000000d801'),
('00000000-0000-4000-8000-00000000d812','Compradora B fila DEMO','BUYER','00000000-0000-4000-8000-00000000d804'),
('00000000-0000-4000-8000-00000000d813','Banco fila DEMO','PROVIDER','00000000-0000-4000-8000-00000000d803'),
('00000000-0000-4000-8000-00000000d814','Compradora C fila DEMO','BUYER','00000000-0000-4000-8000-00000000d804');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-00000000d811','00000000-0000-4000-8000-00000000d801','admin'),
('00000000-0000-4000-8000-00000000d811','00000000-0000-4000-8000-00000000d802','finance_manager'),
('00000000-0000-4000-8000-00000000d813','00000000-0000-4000-8000-00000000d803','provider_user'),
('00000000-0000-4000-8000-00000000d812','00000000-0000-4000-8000-00000000d804','admin');
insert into public.fin_legal_entities(id,organization_id,kind,parent_id,legal_name,currency,created_by) values
('00000000-0000-4000-8000-00000000d821','00000000-0000-4000-8000-00000000d811','legal_entity',null,'Fila E1 Ltda DEMO','BRL','00000000-0000-4000-8000-00000000d801'),
('00000000-0000-4000-8000-00000000d822','00000000-0000-4000-8000-00000000d811','legal_entity',null,'Fila E2 Ltda DEMO','BRL','00000000-0000-4000-8000-00000000d801');
update public.fin_members set entity_scope='entities' where user_id='00000000-0000-4000-8000-00000000d802';
insert into public.fin_member_entity_grants(organization_id,user_id,entity_id,granted_by) values
('00000000-0000-4000-8000-00000000d811','00000000-0000-4000-8000-00000000d802','00000000-0000-4000-8000-00000000d821','00000000-0000-4000-8000-00000000d801');
insert into public.fin_providers(id,organization_id,name,kind,contact_email,created_by) values
('00000000-0000-4000-8000-00000000d831','00000000-0000-4000-8000-00000000d811','Banco contato A DEMO','bank','fu-contato-a@example.invalid','00000000-0000-4000-8000-00000000d801'),
('00000000-0000-4000-8000-00000000d832','00000000-0000-4000-8000-00000000d811','Banco alvo A DEMO','bank','fu-alvo@example.invalid','00000000-0000-4000-8000-00000000d801'),
('00000000-0000-4000-8000-00000000d833','00000000-0000-4000-8000-00000000d812','Banco alvo B DEMO','bank','FU-Alvo@example.invalid','00000000-0000-4000-8000-00000000d804');
-- O banco já impede repetir o mesmo provedor na mesma RFQ; o abuso real é
-- cadastrar vários provedores com o mesmo contato (ou abrir várias RFQs).
insert into public.fin_providers(id,organization_id,name,kind,contact_email,created_by)
select ('00000000-0000-4000-8000-0000000d9' || lpad(g::text,3,'0'))::uuid, '00000000-0000-4000-8000-00000000d811', 'Alvo repetido A ' || g || ' DEMO', 'bank', 'fu-alvo@example.invalid', '00000000-0000-4000-8000-00000000d801' from generate_series(1,4) g;
insert into public.fin_providers(id,organization_id,name,kind,contact_email,created_by)
select ('00000000-0000-4000-8000-0000000d9' || lpad((100+g)::text,3,'0'))::uuid, '00000000-0000-4000-8000-00000000d812', 'Alvo repetido B ' || g || ' DEMO', 'bank', 'FU-Alvo@example.invalid', '00000000-0000-4000-8000-00000000d804' from generate_series(1,3) g;
insert into public.fin_providers(id,organization_id,name,kind,contact_email,created_by)
select ('00000000-0000-4000-8000-0000000d9' || lpad((200+g)::text,3,'0'))::uuid, '00000000-0000-4000-8000-00000000d811', 'Contato distinto ' || g || ' DEMO', 'bank', 'fu-contato-' || g || '@example.invalid', '00000000-0000-4000-8000-00000000d801' from generate_series(1,5) g;
insert into public.fin_rfqs(id,organization_id,product,title,owner_id,status,demand,legal_entity_id) values
('00000000-0000-4000-8000-00000000d841','00000000-0000-4000-8000-00000000d811','credit','Fila RFQ E1 DEMO','00000000-0000-4000-8000-00000000d801','collecting','{}','00000000-0000-4000-8000-00000000d821'),
('00000000-0000-4000-8000-00000000d842','00000000-0000-4000-8000-00000000d812','credit','Fila RFQ B DEMO','00000000-0000-4000-8000-00000000d804','collecting','{}',null),
('00000000-0000-4000-8000-00000000d843','00000000-0000-4000-8000-00000000d811','credit','Fila RFQ E2 DEMO','00000000-0000-4000-8000-00000000d801','collecting','{}','00000000-0000-4000-8000-00000000d822');
insert into public.fin_settings(key,value) values ('email_enabled','true') on conflict(key) do update set value='true';
insert into public.fin_settings(key,value) values ('invite_secret',repeat('f',64)) on conflict(key) do nothing;

create or replace function pg_temp.fu_error(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then return sqlerrm;
end $$;
grant execute on function pg_temp.fu_error(text) to authenticated;
create or replace function pg_temp.fu_outbox(p_org uuid, p_recipient text default null) returns integer language sql as $$
  select count(*)::integer from public.transactional_email_outbox o
   where o.organization_id = p_org and (p_recipient is null or o.recipient_hash = encode(sha256(convert_to(lower(p_recipient),'UTF8')),'hex'));
$$;

-- 0. Superfície: auxiliares fora do alcance do cliente.
do $$ begin
  if has_function_privilege('authenticated','public.fin_email_limit(text,integer,integer,integer)','EXECUTE')
     or has_function_privilege('authenticated','public.fin_enqueue_email(text,text,text,uuid,jsonb,text)','EXECUTE')
     or has_function_privilege('authenticated','public.fin_policy_evidence_document_allowed(uuid,text)','EXECUTE')
     or has_function_privilege('authenticated','public.claim_transactional_email_batch_v2(text,integer)','EXECUTE') then
    raise exception 'auxiliar da fila ou da evidência exposta ao cliente';
  end if;
end $$;

-- 1. Mesmo destinatário: no máximo 3/dia da mesma organização; o convite segue valendo.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000d801',false);
select public.fin_invite_provider('00000000-0000-4000-8000-00000000d841', ('00000000-0000-4000-8000-0000000d9' || lpad(g::text,3,'0'))::uuid) from generate_series(1,4) g;
reset role;
do $$ begin
  if pg_temp.fu_outbox('00000000-0000-4000-8000-00000000d811','fu-alvo@example.invalid') <> 3 then raise exception 'teto por destinatário na organização: %', pg_temp.fu_outbox('00000000-0000-4000-8000-00000000d811','fu-alvo@example.invalid'); end if;
  if (select count(*) from public.fin_rfq_invites where rfq_id = '00000000-0000-4000-8000-00000000d841') <> 4 then raise exception 'convite suprimido junto com o e-mail'; end if;
  if not exists (select 1 from public.fin_events where organization_id = '00000000-0000-4000-8000-00000000d811' and event_type = 'email_suppressed'
                   and metadata->>'reason' = 'recipient_limit') then raise exception 'supressão sem trilha'; end if;
end $$;

-- 2. Mesmo destinatário somando organizações: no máximo 5/dia (e-mail normalizado).
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000d804',false);
select public.fin_invite_provider('00000000-0000-4000-8000-00000000d842', ('00000000-0000-4000-8000-0000000d9' || lpad((100+g)::text,3,'0'))::uuid) from generate_series(1,3) g;
reset role;
do $$ begin
  if pg_temp.fu_outbox('00000000-0000-4000-8000-00000000d812','fu-alvo@example.invalid') <> 2 then raise exception 'teto global por destinatário: %', pg_temp.fu_outbox('00000000-0000-4000-8000-00000000d812','fu-alvo@example.invalid'); end if;
end $$;

-- 3. Teto por organização: acima dele o convite é recusado inteiro (sem convite órfão).
insert into public.fin_settings(key,value) values ('email_org_hourly_limit','5') on conflict(key) do update set value='5';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000d801',false);
select public.fin_invite_provider('00000000-0000-4000-8000-00000000d841', ('00000000-0000-4000-8000-0000000d9' || lpad((200+g)::text,3,'0'))::uuid) from generate_series(1,2) g;
do $$
declare v_before integer := (select count(*) from public.fin_rfq_invites where rfq_id = '00000000-0000-4000-8000-00000000d841');
begin
  if pg_temp.fu_error($q$select public.fin_invite_provider('00000000-0000-4000-8000-00000000d841','00000000-0000-4000-8000-0000000d9203')$q$) is distinct from 'email volume limit' then
    raise exception 'teto por organização não recusou';
  end if;
  if (select count(*) from public.fin_rfq_invites where rfq_id = '00000000-0000-4000-8000-00000000d841') <> v_before then raise exception 'convite órfão após recusa'; end if;
end $$;
reset role;
-- Valor absurdo não desliga a proteção: piso técnico de 5.
update public.fin_settings set value = '0' where key = 'email_org_hourly_limit';
do $$ begin if public.fin_email_limit('email_org_hourly_limit', 60, 5, 1000) <> 5 then raise exception 'piso do limite'; end if; end $$;
delete from public.fin_settings where key = 'email_org_hourly_limit';
do $$ begin if public.fin_email_limit('email_org_hourly_limit', 60, 5, 1000) <> 60 then raise exception 'limite padrão'; end if; end $$;

-- 4. Repetição da chave não duplica; destinatário inválido não enfileira; sem origem não enfileira.
do $$ begin
  perform public.fin_enqueue_email('provider_invite','fu-unico@example.invalid','rfq','00000000-0000-4000-8000-00000000d842','{}'::jsonb,'fu:duplicada');
  perform public.fin_enqueue_email('provider_invite','fu-unico@example.invalid','rfq','00000000-0000-4000-8000-00000000d842','{}'::jsonb,'fu:duplicada');
  if (select count(*) from public.transactional_email_outbox where idempotency_key = 'fu:duplicada') <> 1 then raise exception 'chave repetida duplicou'; end if;
  if public.fin_enqueue_email('provider_invite','sem-arroba','rfq','00000000-0000-4000-8000-00000000d842','{}'::jsonb,'fu:invalido')
     or exists (select 1 from public.transactional_email_outbox where idempotency_key = 'fu:invalido') then raise exception 'destinatário inválido enfileirado'; end if;
  if public.fin_enqueue_email('provider_invite','fu-orfao@example.invalid','rfq','00000000-0000-4000-8000-00000000d899','{}'::jsonb,'fu:orfao') then raise exception 'e-mail sem organização de origem'; end if;
end $$;

-- 5. Claim justo: uma organização com fila grande não ocupa o lote inteiro;
--    falha temporária volta com espera; lease vencida é reivindicada de novo.
begin;
update public.transactional_email_outbox set next_attempt_at = now() + interval '1 day'
 where status in ('pending','retry') and organization_id is distinct from '00000000-0000-4000-8000-00000000d814'
   and organization_id is distinct from '00000000-0000-4000-8000-00000000d812';
insert into public.transactional_email_outbox(event_type,entity_type,entity_id,template,recipient_hash,recipient_address,payload,request_id,idempotency_key,organization_id,created_at)
select 'finance_provider_invite','rfq','x','finance_provider_invite',repeat('c',64),'fu-c@example.invalid','{}'::jsonb,'fu-c','fu:c:'||g,'00000000-0000-4000-8000-00000000d814',now() - interval '2 hours' - (g || ' minutes')::interval
  from generate_series(1,30) g;
do $$
declare v jsonb; v2 jsonb; v_c integer; v_b integer; v_id uuid; v_token uuid; v_stale uuid;
begin
  v := public.claim_transactional_email_batch_v2('fu-worker-0001', 4);
  select count(*) filter (where (x->>'idempotencyKey') like 'fu:c:%'), count(*) filter (where (x->>'idempotencyKey') not like 'fu:c:%')
    into v_c, v_b from jsonb_array_elements(v) x;
  if jsonb_array_length(v) <> 4 or v_b < 2 then raise exception 'organização grande ocupou o lote (C=%, outras=%)', v_c, v_b; end if;
  -- Falha temporária: volta em retry com espera; não é reivindicada de imediato.
  v_id := (v->0->>'id')::uuid; v_token := (v->0->>'claimToken')::uuid;
  perform public.fail_transactional_email_v2(v_id, v_token, 'http_503', 120);
  if (select status from public.transactional_email_outbox where id = v_id) <> 'retry'
     or (select next_attempt_at from public.transactional_email_outbox where id = v_id) < now() + interval '100 seconds' then raise exception 'retry sem espera'; end if;
  -- Indisponibilidade do worker: lease vencida volta para a fila.
  v_stale := (v->1->>'id')::uuid;
  update public.transactional_email_outbox set lease_expires_at = now() - interval '1 minute' where id = v_stale;
  v2 := public.claim_transactional_email_batch_v2('fu-worker-0002', 50);
  if v_stale::text not in (select x->>'id' from jsonb_array_elements(v2) x) then raise exception 'lease vencida não voltou para a fila'; end if;
  if v_id::text in (select x->>'id' from jsonb_array_elements(v2) x) then raise exception 'retry reivindicado antes da espera'; end if;
end $$;
rollback;

-- 6. Evidência de exceção: documento legítimo aceito; de terceiros, fora do escopo ou removido, recusado.
insert into public.fin_rfq_invites(id,buyer_organization_id,rfq_id,provider_id,token_hash,created_by,recipient_mode,provider_organization_id,status,accepted_at) values
('00000000-0000-4000-8000-00000000d851','00000000-0000-4000-8000-00000000d811','00000000-0000-4000-8000-00000000d841','00000000-0000-4000-8000-00000000d831',encode(sha256('fu-followup-invite'::bytea),'hex'),'00000000-0000-4000-8000-00000000d801','organization_open','00000000-0000-4000-8000-00000000d813','accepted',now());
insert into public.fin_proposals(id,invite_id,rfq_id,buyer_organization_id,provider_id,provider_organization_id,product) values
('00000000-0000-4000-8000-00000000d852','00000000-0000-4000-8000-00000000d851','00000000-0000-4000-8000-00000000d841','00000000-0000-4000-8000-00000000d811','00000000-0000-4000-8000-00000000d831','00000000-0000-4000-8000-00000000d813','credit');
insert into public.fin_policies(id,organization_id,name,created_by) values
('00000000-0000-4000-8000-00000000d853','00000000-0000-4000-8000-00000000d811','Alçadas fila DEMO','00000000-0000-4000-8000-00000000d801');
insert into public.fin_policy_versions(id,policy_id,organization_id,version,document,created_by) values
('00000000-0000-4000-8000-00000000d854','00000000-0000-4000-8000-00000000d853','00000000-0000-4000-8000-00000000d811',1,'{"rules":[]}'::jsonb,'00000000-0000-4000-8000-00000000d801');
insert into public.fin_approval_requests(id,organization_id,rfq_id,proposal_id,proposal_version,rfq_updated_at,requested_by,rationale,snapshot,policy_snapshot,evaluated_at) values
('00000000-0000-4000-8000-00000000d855','00000000-0000-4000-8000-00000000d811','00000000-0000-4000-8000-00000000d841','00000000-0000-4000-8000-00000000d852',1,now(),'00000000-0000-4000-8000-00000000d801','Pedido fila DEMO','{}'::jsonb,
 jsonb_build_object('matched', jsonb_build_array(
   jsonb_build_object('policy_version_id','00000000-0000-4000-8000-00000000d854','rule_id','r1'),
   jsonb_build_object('policy_version_id','00000000-0000-4000-8000-00000000d854','rule_id','r2'))), now());
insert into public.fin_private_documents(id,organization_id,buyer_organization_id,entity_type,entity_id,rfq_id,title,visibility,created_by,removed_at) values
('00000000-0000-4000-8000-00000000d861','00000000-0000-4000-8000-00000000d811','00000000-0000-4000-8000-00000000d811','rfq','00000000-0000-4000-8000-00000000d841','00000000-0000-4000-8000-00000000d841','Ata do comitê DEMO','internal','00000000-0000-4000-8000-00000000d801',null),
('00000000-0000-4000-8000-00000000d862','00000000-0000-4000-8000-00000000d812','00000000-0000-4000-8000-00000000d812','rfq','00000000-0000-4000-8000-00000000d842','00000000-0000-4000-8000-00000000d842','Documento de outra empresa DEMO','internal','00000000-0000-4000-8000-00000000d804',null),
('00000000-0000-4000-8000-00000000d863','00000000-0000-4000-8000-00000000d811','00000000-0000-4000-8000-00000000d811','rfq','00000000-0000-4000-8000-00000000d843','00000000-0000-4000-8000-00000000d843','Documento da entidade E2 DEMO','internal','00000000-0000-4000-8000-00000000d801',null),
('00000000-0000-4000-8000-00000000d864','00000000-0000-4000-8000-00000000d811','00000000-0000-4000-8000-00000000d811','rfq','00000000-0000-4000-8000-00000000d841','00000000-0000-4000-8000-00000000d841','Documento removido DEMO','internal','00000000-0000-4000-8000-00000000d801',now()),
('00000000-0000-4000-8000-00000000d865','00000000-0000-4000-8000-00000000d813','00000000-0000-4000-8000-00000000d811','proposal','00000000-0000-4000-8000-00000000d852','00000000-0000-4000-8000-00000000d841','Interno do provedor DEMO','internal','00000000-0000-4000-8000-00000000d803',null);
insert into public.fin_documents(id,organization_id,entity_type,entity_id,title,reference_url,created_by) values
('00000000-0000-4000-8000-00000000d866','00000000-0000-4000-8000-00000000d811','rfq','00000000-0000-4000-8000-00000000d841','Parecer jurídico DEMO','https://docs.example.invalid/parecer','00000000-0000-4000-8000-00000000d801'),
('00000000-0000-4000-8000-00000000d867','00000000-0000-4000-8000-00000000d811','rfq','00000000-0000-4000-8000-00000000d843','Parecer da E2 DEMO','https://docs.example.invalid/e2','00000000-0000-4000-8000-00000000d801');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000d802',false);
do $$
declare v_call text := $q$select public.fin_request_policy_exception('00000000-0000-4000-8000-00000000d855','00000000-0000-4000-8000-00000000d854','r1','market_constraint','Só um banco atende no prazo do trimestre','[{"label":"Evidência","document_id":"%s"}]'::jsonb)$q$;
begin
  -- Recusados: outra empresa, outra entidade, removido, documento interno do provedor, referência de outra entidade, id malformado.
  if pg_temp.fu_error(format(v_call, '00000000-0000-4000-8000-00000000d862')) is distinct from 'invalid policy exception' then raise exception 'evidência de outra empresa aceita'; end if;
  if pg_temp.fu_error(format(v_call, '00000000-0000-4000-8000-00000000d863')) is distinct from 'invalid policy exception' then raise exception 'evidência fora do escopo de entidade aceita'; end if;
  if pg_temp.fu_error(format(v_call, '00000000-0000-4000-8000-00000000d864')) is distinct from 'invalid policy exception' then raise exception 'documento removido aceito'; end if;
  if pg_temp.fu_error(format(v_call, '00000000-0000-4000-8000-00000000d865')) is distinct from 'invalid policy exception' then raise exception 'documento interno do provedor aceito'; end if;
  if pg_temp.fu_error(format(v_call, '00000000-0000-4000-8000-00000000d867')) is distinct from 'invalid policy exception' then raise exception 'referência de outra entidade aceita'; end if;
  if pg_temp.fu_error(format(v_call, 'nao-e-uuid')) is distinct from 'invalid policy exception' then raise exception 'id malformado aceito'; end if;
  if exists (select 1 from public.fin_policy_exceptions where request_id = '00000000-0000-4000-8000-00000000d855') then raise exception 'exceção criada com evidência inválida'; end if;
end $$;
-- Aceitos: documento privado legível pela pessoa (antes recusado sempre) e referência externa no escopo.
select public.fin_request_policy_exception('00000000-0000-4000-8000-00000000d855','00000000-0000-4000-8000-00000000d854','r1','market_constraint',
  'Só um banco atende no prazo do trimestre','[{"label":"Ata do comitê","document_id":"00000000-0000-4000-8000-00000000d861"}]'::jsonb);
select public.fin_request_policy_exception('00000000-0000-4000-8000-00000000d855','00000000-0000-4000-8000-00000000d854','r2','market_constraint',
  'Parecer jurídico sustenta a contratação','[{"label":"Parecer","document_id":"00000000-0000-4000-8000-00000000d866"}]'::jsonb);
reset role;
do $$ begin
  if (select count(*) from public.fin_policy_exceptions where request_id = '00000000-0000-4000-8000-00000000d855') <> 2 then raise exception 'evidência legítima recusada'; end if;
  if (select count(*) from public.fin_events where event_type = 'policy_exception_requested' and metadata->>'request_id' = '00000000-0000-4000-8000-00000000d855') <> 2 then raise exception 'exceção sem trilha'; end if;
end $$;
select set_config('request.jwt.claim.sub','',false);
update public.fin_settings set value='false' where key='email_enabled';
-- A fila é compartilhada pelas suítes seguintes (claims contam itens prontos):
-- os e-mails desta suíte saem dela.
delete from public.transactional_email_outbox
 where organization_id in ('00000000-0000-4000-8000-00000000d811','00000000-0000-4000-8000-00000000d812','00000000-0000-4000-8000-00000000d814')
    or idempotency_key like 'fu:%';
\echo 'Pendências da #178: teto por destinatário (organização e global), teto por organização sem convite órfão, limites com piso, chave repetida, destinatário inválido, claim justo, retry com espera, lease vencida e evidência de exceção (legítima aceita; outra empresa, entidade, removida e interna do provedor recusadas) validados.'

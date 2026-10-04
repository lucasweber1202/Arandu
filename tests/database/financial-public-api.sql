\set ON_ERROR_STOP on
-- Public API v1 & Webhooks (docs/supabase-financial-public-api.sql).
-- Credencial só por hash, escopo + organização + entidade + objeto, keyset,
-- idempotência, outbox mínimo, worker com lease/backoff/dead-letter/replay,
-- desativação automática, revogação em cascata e negações (outro tenant,
-- membro comum, provedor, cliente sem service role).
--
-- Pessoas ...0000000c80NN: 01 admin G · 02 gestão financeira só A · 03 leitura G
--   04 admin O (outro tenant) · 05 provedor
insert into auth.users(id,email) values
('00000000-0000-4000-8000-0000000c8001','api-admin@example.invalid'),
('00000000-0000-4000-8000-0000000c8002','api-manager-a@example.invalid'),
('00000000-0000-4000-8000-0000000c8003','api-viewer@example.invalid'),
('00000000-0000-4000-8000-0000000c8004','api-other-admin@example.invalid'),
('00000000-0000-4000-8000-0000000c8005','api-provider@example.invalid')
on conflict(id) do nothing;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-0000000c8101','Grupo API DEMO','BUYER','00000000-0000-4000-8000-0000000c8001'),
('00000000-0000-4000-8000-0000000c8102','Outro grupo API DEMO','BUYER','00000000-0000-4000-8000-0000000c8004'),
('00000000-0000-4000-8000-0000000c8103','Banco API DEMO','PROVIDER','00000000-0000-4000-8000-0000000c8005');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-0000000c8101','00000000-0000-4000-8000-0000000c8001','admin'),
('00000000-0000-4000-8000-0000000c8101','00000000-0000-4000-8000-0000000c8002','finance_manager'),
('00000000-0000-4000-8000-0000000c8101','00000000-0000-4000-8000-0000000c8003','viewer'),
('00000000-0000-4000-8000-0000000c8102','00000000-0000-4000-8000-0000000c8004','admin'),
('00000000-0000-4000-8000-0000000c8103','00000000-0000-4000-8000-0000000c8005','provider_user');
insert into public.fin_legal_entities(id,organization_id,kind,parent_id,legal_name,currency,created_by) values
('00000000-0000-4000-8000-0000000c8201','00000000-0000-4000-8000-0000000c8101','legal_entity',null,'API A Ltda DEMO','BRL','00000000-0000-4000-8000-0000000c8001'),
('00000000-0000-4000-8000-0000000c8202','00000000-0000-4000-8000-0000000c8101','legal_entity',null,'API B Ltda DEMO','BRL','00000000-0000-4000-8000-0000000c8001');
update public.fin_members set entity_scope='entities' where user_id='00000000-0000-4000-8000-0000000c8002';
insert into public.fin_member_entity_grants(organization_id,user_id,entity_id,granted_by) values
('00000000-0000-4000-8000-0000000c8101','00000000-0000-4000-8000-0000000c8002','00000000-0000-4000-8000-0000000c8201','00000000-0000-4000-8000-0000000c8001');
insert into public.fin_rfqs(id,organization_id,product,title,owner_id,status,demand,legal_entity_id,created_at) values
('00000000-0000-4000-8000-0000000c8401','00000000-0000-4000-8000-0000000c8101','credit','API R1 A DEMO','00000000-0000-4000-8000-0000000c8001','collecting','{"amount":1000}','00000000-0000-4000-8000-0000000c8201',now()-interval '3 hours'),
('00000000-0000-4000-8000-0000000c8402','00000000-0000-4000-8000-0000000c8101','credit','API R2 B DEMO','00000000-0000-4000-8000-0000000c8001','collecting','{"amount":2000}','00000000-0000-4000-8000-0000000c8202',now()-interval '2 hours'),
('00000000-0000-4000-8000-0000000c8403','00000000-0000-4000-8000-0000000c8101','credit','API R3 grupo DEMO','00000000-0000-4000-8000-0000000c8001','draft','{"amount":3000}',null,now()-interval '1 hour'),
('00000000-0000-4000-8000-0000000c8404','00000000-0000-4000-8000-0000000c8102','credit','API outro tenant DEMO','00000000-0000-4000-8000-0000000c8004','draft','{"amount":4000}',null,now());

create temporary table api_ids(key text primary key, value uuid);
grant all on api_ids to authenticated, service_role;
create or replace function pg_temp.expect_error(p_sql text, p_message text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'esperava falha "%" em: %', p_message, p_sql;
exception when others then
  if sqlerrm not like p_message || '%' then raise exception 'falha inesperada em %: % (esperava %)', p_sql, sqlerrm, p_message; end if;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated, service_role;
create or replace function pg_temp.as_user(p_suffix text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000c80' || p_suffix, false);
$$;
grant execute on function pg_temp.as_user(text) to authenticated, service_role;

-- 1. Superfície: cliente nunca executa fin_api_* nem o worker; hash e segredo
--    não são legíveis nem por admin.
do $$ begin
  if has_function_privilege('authenticated','public.fin_api_list_rfqs(text,integer,timestamp with time zone,uuid,text,uuid,timestamp with time zone)','EXECUTE')
     or has_function_privilege('authenticated','public.fin_api_create_rfq(text,text,text,jsonb,text)','EXECUTE')
     or has_function_privilege('authenticated','public.fin_webhook_claim(integer,integer,uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.fin_api_context(text,text)','EXECUTE')
     or has_function_privilege('anon','public.fin_api_whoami(text)','EXECUTE')
     or has_column_privilege('authenticated','public.fin_api_credentials','token_hash','SELECT')
     or has_column_privilege('authenticated','public.fin_webhook_endpoints','secret_ciphertext','SELECT')
     or has_table_privilege('authenticated','public.fin_api_idempotency','SELECT')
     or has_table_privilege('authenticated','public.fin_webhook_events','SELECT')
     or has_table_privilege('authenticated','public.fin_service_accounts','INSERT') then
    raise exception 'superfície da API pública exposta ao cliente';
  end if;
  if not has_function_privilege('service_role','public.fin_api_list_rfqs(text,integer,timestamp with time zone,uuid,text,uuid,timestamp with time zone)','EXECUTE') then
    raise exception 'service role sem a superfície de máquina';
  end if;
end $$;

-- 2. Administração: só admin; escopo e entidades validados; segredo do token
--    nunca chega ao banco (só hash e prefixo).
set role authenticated;
select pg_temp.as_user('02');
select pg_temp.expect_error($q$select public.fin_create_service_account('00000000-0000-4000-8000-0000000c8101','ERP',null,array['rfqs:read'],'group',null)$q$, 'forbidden');
select pg_temp.as_user('01');
select pg_temp.expect_error($q$select public.fin_create_service_account('00000000-0000-4000-8000-0000000c8101','ERP',null,array['admin:all'],'group',null)$q$, 'invalid service account');
select pg_temp.expect_error($q$select public.fin_create_service_account('00000000-0000-4000-8000-0000000c8101','ERP',null,array['rfqs:read'],'entities',null)$q$, 'invalid service account');
select pg_temp.expect_error($q$select public.fin_create_service_account('00000000-0000-4000-8000-0000000c8101','ERP',null,array['rfqs:read'],'entities',array['00000000-0000-4000-8000-0000000c8999'::uuid])$q$, 'invalid service account');
insert into api_ids select 'sa_group', public.fin_create_service_account('00000000-0000-4000-8000-0000000c8101','ERP do grupo','Integração SAP',
  array['rfqs:read','rfqs:write','contracts:read','webhooks:manage'],'group',null);
insert into api_ids select 'sa_a', public.fin_create_service_account('00000000-0000-4000-8000-0000000c8101','TMS da A',null,
  array['rfqs:read','webhooks:manage'],'entities',array['00000000-0000-4000-8000-0000000c8201'::uuid]);
select pg_temp.expect_error(format($q$select public.fin_issue_api_credential('%s','%s','arnd_test_AbC123',now()+interval '400 days')$q$,
  (select value from api_ids where key='sa_group'), repeat('a',64)), 'invalid credential');
select pg_temp.expect_error(format($q$select public.fin_issue_api_credential('%s','plaintext-token','arnd_test_AbC123',now()+interval '30 days')$q$,
  (select value from api_ids where key='sa_group')), 'invalid credential');
insert into api_ids select 'cred_group', public.fin_issue_api_credential((select value from api_ids where key='sa_group'), repeat('a',64), 'arnd_test_Aaaaaa', now()+interval '90 days');
insert into api_ids select 'cred_group2', public.fin_issue_api_credential((select value from api_ids where key='sa_group'), repeat('b',64), 'arnd_test_Bbbbbb', now()+interval '90 days');
select pg_temp.expect_error(format($q$select public.fin_issue_api_credential('%s','%s','arnd_test_Cccccc',now()+interval '30 days')$q$,
  (select value from api_ids where key='sa_group'), repeat('c',64)), 'too many active credentials');
insert into api_ids select 'cred_a', public.fin_issue_api_credential((select value from api_ids where key='sa_a'), repeat('d',64), 'arnd_test_Dddddd', now()+interval '90 days');
-- Membro comum não enxerga contas de serviço; admin vê metadados, nunca o hash.
select pg_temp.as_user('03');
do $$ begin if exists (select 1 from public.fin_service_accounts) or exists (select 1 from public.fin_api_credentials) then raise exception 'membro comum vê credenciais'; end if; end $$;
select pg_temp.as_user('01');
do $$ begin if (select count(*) from public.fin_api_credentials) <> 3 then raise exception 'admin não vê metadados das credenciais'; end if; end $$;
select pg_temp.expect_error($q$select token_hash from public.fin_api_credentials$q$, 'permission denied');
-- Outro tenant cria a própria conta (para provar isolamento).
select pg_temp.as_user('04');
insert into api_ids select 'sa_other', public.fin_create_service_account('00000000-0000-4000-8000-0000000c8102','ERP alheio',null,array['rfqs:read'],'group',null);
insert into api_ids select 'cred_other', public.fin_issue_api_credential((select value from api_ids where key='sa_other'), repeat('e',64), 'arnd_test_Eeeeee', now()+interval '90 days');
select pg_temp.as_user('05');
select pg_temp.expect_error($q$select public.fin_create_service_account('00000000-0000-4000-8000-0000000c8103','Provedor',null,array['rfqs:read'],'group',null)$q$, 'forbidden');

-- 3. Máquina (service role, sem sessão humana): contexto, escopo e entidade.
reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;
select pg_temp.expect_error($q$select public.fin_api_whoami('not-a-hash')$q$, 'api unauthorized');
select pg_temp.expect_error(format($q$select public.fin_api_whoami('%s')$q$, repeat('f',64)), 'api unauthorized');
select pg_temp.expect_error(format($q$select public.fin_api_list_contracts('%s')$q$, repeat('d',64)), 'api scope denied');
do $$
declare v jsonb; r jsonb;
begin
  v := public.fin_api_list_rfqs(repeat('a',64), 25);
  if jsonb_array_length(v) <> 3 then raise exception 'conta de grupo deveria ver 3 RFQs do grupo: %', v; end if;
  if v::text like '%outro tenant%' then raise exception 'vazou RFQ de outro tenant'; end if;
  -- Escopo restrito: só a entidade A; nada de nível de grupo nem da B.
  v := public.fin_api_list_rfqs(repeat('d',64), 25);
  if jsonb_array_length(v) <> 1 or v->0->>'id' <> '00000000-0000-4000-8000-0000000c8401' then raise exception 'escopo de entidade vazou: %', v; end if;
  -- Keyset determinístico: limite 1 devolve 2 (sinal de próxima página); o cursor continua sem repetir.
  v := public.fin_api_list_rfqs(repeat('a',64), 1);
  if jsonb_array_length(v) <> 2 or v->0->>'id' <> '00000000-0000-4000-8000-0000000c8403' then raise exception 'primeira página: %', v; end if;
  r := public.fin_api_list_rfqs(repeat('a',64), 1, (v->0->>'created_at')::timestamptz, (v->0->>'id')::uuid);
  if r->0->>'id' <> '00000000-0000-4000-8000-0000000c8402' then raise exception 'cursor: %', r; end if;
  -- Outro tenant não vê nada do grupo; último uso registrado.
  v := public.fin_api_list_rfqs(repeat('e',64), 25);
  if jsonb_array_length(v) <> 1 or v->0->>'id' <> '00000000-0000-4000-8000-0000000c8404' then raise exception 'isolamento entre tenants: %', v; end if;
  if (select last_used_at from public.fin_api_credentials where token_hash = repeat('a',64)) is null then raise exception 'último uso não registrado'; end if;
end $$;
select pg_temp.expect_error(format($q$select public.fin_api_get_rfq('%s','00000000-0000-4000-8000-0000000c8402')$q$, repeat('d',64)), 'api not found');
select pg_temp.expect_error(format($q$select public.fin_api_get_rfq('%s','00000000-0000-4000-8000-0000000c8401')$q$, repeat('e',64)), 'api not found');
select pg_temp.expect_error(format($q$select public.fin_api_list_rfqs('%s',10,now(),null)$q$, repeat('a',64)), 'invalid api query');

-- 4. Escrita idempotente.
select pg_temp.expect_error(format($q$select public.fin_api_create_rfq('%s','curta','%s','{}'::jsonb)$q$, repeat('a',64), repeat('1',64)), 'idempotency key required');
select pg_temp.expect_error(format($q$select public.fin_api_create_rfq('%s','erp-0001-x','%s','{"product":"credit","title":"Capital de giro A","demand":{"amount":5},"owner_id":"00000000-0000-4000-8000-0000000c8003","legal_entity_id":"00000000-0000-4000-8000-0000000c8201"}'::jsonb)$q$, repeat('a',64), repeat('1',64)), 'invalid api owner');
select pg_temp.expect_error(format($q$select public.fin_api_create_rfq('%s','erp-0001-x','%s','{"product":"credit","title":"Capital de giro B","demand":{"amount":5},"owner_id":"00000000-0000-4000-8000-0000000c8002","legal_entity_id":"00000000-0000-4000-8000-0000000c8202"}'::jsonb)$q$, repeat('a',64), repeat('1',64)), 'invalid api owner');
select pg_temp.expect_error(format($q$select public.fin_api_create_rfq('%s','erp-0001-x','%s','{"product":"crypto","title":"Capital de giro A","demand":{},"owner_id":"00000000-0000-4000-8000-0000000c8002"}'::jsonb)$q$, repeat('a',64), repeat('1',64)), 'invalid api payload');
select pg_temp.expect_error(format($q$select public.fin_api_create_rfq('%s','erp-0001-x','%s','{"product":"credit","title":"Capital A","demand":{},"owner_id":"00000000-0000-4000-8000-0000000c8002"}'::jsonb)$q$, repeat('d',64), repeat('1',64)), 'api scope denied');
do $$
declare v jsonb; w jsonb;
begin
  v := public.fin_api_create_rfq(repeat('a',64), 'erp-0001-x', repeat('1',64),
    '{"product":"credit","title":"Capital de giro A via ERP","demand":{"amount":5000},"owner_id":"00000000-0000-4000-8000-0000000c8002","legal_entity_id":"00000000-0000-4000-8000-0000000c8201"}'::jsonb, 'corr-123');
  w := public.fin_api_create_rfq(repeat('a',64), 'erp-0001-x', repeat('1',64), '{"ignored":true}'::jsonb, 'corr-124');
  if w->>'id' <> v->>'id' or (w->>'idempotent_replay')::boolean is not true then raise exception 'repetição não devolveu o mesmo resultado: % / %', v, w; end if;
  if (select count(*) from public.fin_rfqs where title = 'Capital de giro A via ERP') <> 1 then raise exception 'repetição duplicou a RFQ'; end if;
  if not exists (select 1 from public.fin_events where entity_id = (v->>'id')::uuid and event_type = 'rfq_created' and metadata->>'source' = 'api_v1'
                  and metadata->>'correlation_id' = 'corr-123' and actor_id is null) then raise exception 'trilha da escrita por API'; end if;
  insert into api_ids values ('api_rfq', (v->>'id')::uuid);
end $$;
select pg_temp.expect_error(format($q$select public.fin_api_create_rfq('%s','erp-0001-x','%s','{}'::jsonb)$q$, repeat('a',64), repeat('2',64)), 'idempotency key reuse');

-- 5. Webhooks: URL pública https apenas; eventos mínimos; filtro por entidade.
select pg_temp.expect_error(format($q$select public.fin_api_create_webhook('%s','http://erp.example.com/hook',array['rfq.created'],'v1.aaaa.bbbb.cccc',null,null)$q$, repeat('a',64)), 'invalid webhook');
select pg_temp.expect_error(format($q$select public.fin_api_create_webhook('%s','https://localhost/hook',array['rfq.created'],'v1.aaaa.bbbb.cccc',null,null)$q$, repeat('a',64)), 'invalid webhook');
select pg_temp.expect_error(format($q$select public.fin_api_create_webhook('%s','https://10.0.0.8/hook',array['rfq.created'],'v1.aaaa.bbbb.cccc',null,null)$q$, repeat('a',64)), 'invalid webhook');
select pg_temp.expect_error(format($q$select public.fin_api_create_webhook('%s','https://169.254.169.254/latest',array['rfq.created'],'v1.aaaa.bbbb.cccc',null,null)$q$, repeat('a',64)), 'invalid webhook');
select pg_temp.expect_error(format($q$select public.fin_api_create_webhook('%s','https://user:pw@erp.example.com/hook',array['rfq.created'],'v1.aaaa.bbbb.cccc',null,null)$q$, repeat('a',64)), 'invalid webhook');
select pg_temp.expect_error(format($q$select public.fin_api_create_webhook('%s','https://erp.example.com:8443/hook',array['rfq.created'],'v1.aaaa.bbbb.cccc',null,null)$q$, repeat('a',64)), 'invalid webhook');
select pg_temp.expect_error(format($q$select public.fin_api_create_webhook('%s','https://erp.example.com/hook',array['rfq.deleted'],'v1.aaaa.bbbb.cccc',null,null)$q$, repeat('a',64)), 'invalid webhook');
select pg_temp.expect_error(format($q$select public.fin_api_create_webhook('%s','https://erp.example.com/hook',array['rfq.created'],'plaintext-secret',null,null)$q$, repeat('a',64)), 'invalid webhook');
-- Conta restrita à A não cria webhook sem filtro nem para a B.
select pg_temp.expect_error(format($q$select public.fin_api_create_webhook('%s','https://tms.example.com/hook',array['rfq.created'],'v1.aaaa.bbbb.cccc',null,null)$q$, repeat('d',64)), 'api entity denied');
select pg_temp.expect_error(format($q$select public.fin_api_create_webhook('%s','https://tms.example.com/hook',array['rfq.created'],'v1.aaaa.bbbb.cccc',null,array['00000000-0000-4000-8000-0000000c8202'::uuid])$q$, repeat('d',64)), 'api entity denied');
insert into api_ids select 'hook_all', public.fin_api_create_webhook(repeat('a',64), 'https://erp.example.com/hook', array['rfq.created','rfq.status_changed','approval.required'], 'v1.aaaa.bbbb.cccc', 'ERP', null);
insert into api_ids select 'hook_b', public.fin_api_create_webhook(repeat('a',64), 'https://erp.example.com/hook-b', array['rfq.created'], 'v1.aaaa.bbbb.cccc', 'Só B', array['00000000-0000-4000-8000-0000000c8202'::uuid]);
insert into api_ids select 'hook_a', public.fin_api_create_webhook(repeat('d',64), 'https://tms.example.com/hook', array['rfq.created'], 'v1.aaaa.bbbb.cccc', 'TMS A', array['00000000-0000-4000-8000-0000000c8201'::uuid]);
do $$
declare v jsonb; e record;
begin
  v := public.fin_api_create_rfq(repeat('a',64), 'erp-0002-x', repeat('3',64),
    '{"product":"credit","title":"Segunda via ERP com termos","demand":{"amount":7777},"owner_id":"00000000-0000-4000-8000-0000000c8002","legal_entity_id":"00000000-0000-4000-8000-0000000c8201"}'::jsonb);
  select * into e from public.fin_webhook_events where source_event_id = (select id from public.fin_events where entity_id = (v->>'id')::uuid and event_type = 'rfq_created');
  if e.event_type <> 'rfq.created' or e.payload->'data'->>'rfq_id' <> v->>'id' or e.legal_entity_id <> '00000000-0000-4000-8000-0000000c8201' then raise exception 'evento de webhook: %', row_to_json(e); end if;
  if e.payload::text ~ '(7777|Segunda via|amount|title)' then raise exception 'payload além do necessário: %', e.payload; end if;
  if (select count(*) from public.fin_webhook_deliveries where event_id = e.id) <> 2
     or exists (select 1 from public.fin_webhook_deliveries where event_id = e.id and endpoint_id = (select value from api_ids where key='hook_b')) then
    raise exception 'filtro de entidade do webhook';
  end if;
end $$;

-- 6. Worker: lease (fencing), backoff, dead-letter, replay e desativação automática.
do $$
declare c record; v_status text; v_lease uuid; v_id uuid;
begin
  select * into c from public.fin_webhook_claim(100, 60) where endpoint_id = (select value from api_ids where key='hook_all') limit 1;
  if c.delivery_id is null or c.secret_ciphertext <> 'v1.aaaa.bbbb.cccc' or c.attempt <> 1 then raise exception 'claim: %', row_to_json(c); end if;
  begin
    perform public.fin_webhook_complete(c.delivery_id, gen_random_uuid(), true, 200, null);
    raise exception 'lease alheio concluiu entrega';
  exception when others then if sqlerrm not like 'stale lease%' then raise; end if; end;
  v_status := public.fin_webhook_complete(c.delivery_id, c.lease_token, false, 500, 'http_5xx');
  if v_status <> 'failed' or (select next_attempt_at from public.fin_webhook_deliveries where id = c.delivery_id) <= now() then raise exception 'backoff ausente'; end if;
  if exists (select 1 from public.fin_webhook_claim(100, 60) where delivery_id = c.delivery_id) then raise exception 'reentregou antes do backoff'; end if;
  -- Até a 8ª tentativa: dead-letter.
  for i in 2..8 loop
    update public.fin_webhook_deliveries set next_attempt_at = now() - interval '1 second' where id = c.delivery_id;
    select lease_token into v_lease from public.fin_webhook_claim(100, 60) where delivery_id = c.delivery_id;
    v_status := public.fin_webhook_complete(c.delivery_id, v_lease, false, null, 'timeout');
  end loop;
  if v_status <> 'dead' then raise exception 'dead-letter após 8 tentativas: %', v_status; end if;
  -- Replay pela API cria nova entrega ligada à original.
  v_id := public.fin_api_replay_delivery(repeat('a',64), c.delivery_id);
  if not exists (select 1 from public.fin_webhook_deliveries where id = v_id and replay_of = c.delivery_id and status = 'pending') then raise exception 'replay'; end if;
  select lease_token into v_lease from public.fin_webhook_claim(100, 60) where delivery_id = v_id;
  if public.fin_webhook_complete(v_id, v_lease, true, 204, null) <> 'succeeded' then raise exception 'entrega do replay'; end if;
  -- 20 falhas seguidas desativam o endpoint e cancelam a fila.
  update public.fin_webhook_endpoints set consecutive_failures = 19 where id = (select value from api_ids where key='hook_all');
  insert into public.fin_webhook_deliveries(organization_id, endpoint_id, event_id, replay_of)
    select organization_id, endpoint_id, event_id, id from public.fin_webhook_deliveries where id = c.delivery_id;
  select delivery_id, lease_token into v_id, v_lease from public.fin_webhook_claim(100, 60) where endpoint_id = (select value from api_ids where key='hook_all') limit 1;
  perform public.fin_webhook_complete(v_id, v_lease, false, 410, 'http_4xx');
  if (select status from public.fin_webhook_endpoints where id = (select value from api_ids where key='hook_all')) <> 'disabled_failing' then raise exception 'desativação automática'; end if;
  if exists (select 1 from public.fin_webhook_deliveries where endpoint_id = (select value from api_ids where key='hook_all') and status in ('pending','failed')) then raise exception 'fila não cancelada'; end if;
end $$;
select pg_temp.expect_error(format($q$select public.fin_api_replay_delivery('%s', (select id from public.fin_webhook_deliveries where endpoint_id='%s' limit 1))$q$,
  repeat('a',64), (select value from api_ids where key='hook_all')), 'webhook disabled');
-- Outro tenant não lista nem reprocessa entregas do grupo.
select pg_temp.expect_error(format($q$select public.fin_api_list_deliveries('%s','%s')$q$, repeat('e',64), (select value from api_ids where key='hook_b')), 'api scope denied');
reset role;

-- 7. Interface humana: admin reativa, entrega lista, membro comum nada vê.
set role authenticated;
select pg_temp.as_user('01');
select public.fin_set_webhook_status((select value from api_ids where key='hook_all'), true);
do $$ begin
  if (select status from public.fin_webhook_endpoints where id = (select value from api_ids where key='hook_all')) <> 'active' then raise exception 'reativação'; end if;
  if not exists (select 1 from public.fin_webhook_deliveries where endpoint_id = (select value from api_ids where key='hook_all')) then raise exception 'admin não vê entregas'; end if;
end $$;
select pg_temp.expect_error($q$select secret_ciphertext from public.fin_webhook_endpoints$q$, 'permission denied');
select pg_temp.expect_error($q$select public.fin_create_webhook_endpoint('00000000-0000-4000-8000-0000000c8101','https://192.168.1.10/x',array['rfq.created'],'v1.aaaa.bbbb.cccc',null,null)$q$, 'invalid webhook');
select pg_temp.as_user('03');
do $$ begin if exists (select 1 from public.fin_webhook_endpoints) or exists (select 1 from public.fin_webhook_deliveries) then raise exception 'membro comum vê webhooks'; end if; end $$;
select pg_temp.expect_error(format($q$select public.fin_set_webhook_status('%s', false)$q$, (select value from api_ids where key='hook_all')), 'forbidden');
select pg_temp.as_user('04');
do $$ begin if exists (select 1 from public.fin_webhook_endpoints where organization_id='00000000-0000-4000-8000-0000000c8101') then raise exception 'outro tenant vê webhooks'; end if; end $$;
select pg_temp.expect_error(format($q$select public.fin_revoke_service_account('%s')$q$, (select value from api_ids where key='sa_group')), 'forbidden');

-- 8. Revogação: conta revogada derruba credenciais e desativa webhooks dela.
select pg_temp.as_user('01');
select public.fin_revoke_api_credential((select value from api_ids where key='cred_group2'));
select public.fin_revoke_service_account((select value from api_ids where key='sa_a'));
do $$ begin
  if (select status from public.fin_webhook_endpoints where id = (select value from api_ids where key='hook_a')) <> 'disabled'
     or (select disabled_reason from public.fin_webhook_endpoints where id = (select value from api_ids where key='hook_a')) <> 'service_account_revoked' then raise exception 'webhook da conta revogada'; end if;
  if exists (select 1 from public.fin_api_credentials where service_account_id = (select value from api_ids where key='sa_a') and revoked_at is null) then raise exception 'credencial sobreviveu'; end if;
end $$;
-- Escopo reduzido vale na próxima chamada.
select public.fin_update_service_account((select value from api_ids where key='sa_group'), array['contracts:read'], 'group', null, 'active');
reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;
select pg_temp.expect_error(format($q$select public.fin_api_whoami('%s')$q$, repeat('d',64)), 'api unauthorized');
select pg_temp.expect_error(format($q$select public.fin_api_whoami('%s')$q$, repeat('b',64)), 'api unauthorized');
select pg_temp.expect_error(format($q$select public.fin_api_list_rfqs('%s')$q$, repeat('a',64)), 'api scope denied');
do $$ begin if jsonb_array_length(public.fin_api_list_contracts(repeat('a',64))) <> 0 then raise exception 'contratos inesperados'; end if; end $$;
reset role;
-- Credencial expirada não autentica.
update public.fin_api_credentials set created_at = now() - interval '10 days', expires_at = now() - interval '1 second' where token_hash = repeat('e',64);
set role service_role;
select pg_temp.expect_error(format($q$select public.fin_api_whoami('%s')$q$, repeat('e',64)), 'api unauthorized');
reset role;
-- Cliente humano não executa o worker nem a limpeza.
set role authenticated;
select pg_temp.as_user('01');
select pg_temp.expect_error($q$select * from public.fin_webhook_claim(1,60)$q$, 'permission denied');
select pg_temp.expect_error($q$select public.fin_api_purge_idempotency()$q$, 'permission denied');
reset role;
select set_config('request.jwt.claim.sub','',false);

\set ON_ERROR_STOP on
-- Multi-entity (docs/supabase-financial-multi-entity.sql): entidades legais e
-- unidades, escopo por membro, RLS por entidade em leitura, guarda central de
-- escrita (inclusive via RPCs existentes), consolidação sem vazamento, trilha
-- com entidade, reatribuição auditada e negações para outro tenant/provedor.
--
-- Pessoas (grupo Vitta DEMO):
--   ee01 admin do grupo          ee02 gestão financeira do grupo (escopo group)
--   ee03 gestão financeira só A  ee04 gestão financeira só B
--   ee05 leitura/aprovação só A  ee06 admin de outra empresa
--   ee07 usuário de provedor     ee08 externo
insert into auth.users(id,email) values
('00000000-0000-4000-8000-0000000ee001','me-admin@example.invalid'),
('00000000-0000-4000-8000-0000000ee002','me-group-manager@example.invalid'),
('00000000-0000-4000-8000-0000000ee003','me-manager-a@example.invalid'),
('00000000-0000-4000-8000-0000000ee004','me-manager-b@example.invalid'),
('00000000-0000-4000-8000-0000000ee005','me-viewer-a@example.invalid'),
('00000000-0000-4000-8000-0000000ee006','me-other-admin@example.invalid'),
('00000000-0000-4000-8000-0000000ee007','me-provider@example.invalid'),
('00000000-0000-4000-8000-0000000ee008','me-outsider@example.invalid')
on conflict(id) do nothing;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-0000000ef001','Grupo multi-entity DEMO','BUYER','00000000-0000-4000-8000-0000000ee001'),
('00000000-0000-4000-8000-0000000ef002','Outro grupo DEMO','BUYER','00000000-0000-4000-8000-0000000ee006'),
('00000000-0000-4000-8000-0000000ef003','Banco multi-entity DEMO','PROVIDER','00000000-0000-4000-8000-0000000ee007');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-0000000ef001','00000000-0000-4000-8000-0000000ee001','admin'),
('00000000-0000-4000-8000-0000000ef001','00000000-0000-4000-8000-0000000ee002','finance_manager'),
('00000000-0000-4000-8000-0000000ef001','00000000-0000-4000-8000-0000000ee003','finance_manager'),
('00000000-0000-4000-8000-0000000ef001','00000000-0000-4000-8000-0000000ee004','finance_manager'),
('00000000-0000-4000-8000-0000000ef001','00000000-0000-4000-8000-0000000ee005','viewer'),
('00000000-0000-4000-8000-0000000ef002','00000000-0000-4000-8000-0000000ee006','admin'),
('00000000-0000-4000-8000-0000000ef003','00000000-0000-4000-8000-0000000ee007','provider_user');
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
('00000000-0000-4000-8000-0000000ef010','00000000-0000-4000-8000-0000000ef001','Banco do grupo DEMO','bank','00000000-0000-4000-8000-0000000ee001');

create temporary table me_ids(key text primary key, value uuid);
grant all on me_ids to authenticated;

-- Afirma que o bloco falha com a mensagem esperada (sem vazar outra coisa).
create or replace function pg_temp.expect_error(p_sql text, p_message text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'esperava falha "%" em: %', p_message, p_sql;
exception when others then
  if sqlerrm not like p_message || '%' then raise exception 'falha inesperada em %: % (esperava %)', p_sql, sqlerrm, p_message; end if;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated;

-- 1. Superfície: tabelas novas só por RPC; auxiliares internas fora do cliente.
do $$ begin
  if has_table_privilege('authenticated','public.fin_legal_entities','INSERT')
     or has_table_privilege('authenticated','public.fin_legal_entities','UPDATE')
     or has_table_privilege('authenticated','public.fin_member_entity_grants','INSERT')
     or has_table_privilege('authenticated','public.fin_member_entity_grants','DELETE')
     or has_table_privilege('anon','public.fin_legal_entities','SELECT')
     or has_table_privilege('anon','public.fin_member_entity_grants','SELECT') then
    raise exception 'escrita direta ou leitura anônima em entidades';
  end if;
  if has_function_privilege('authenticated','public.fin_assert_entity_write(uuid,uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.fin_object_legal_entity(text,uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.fin_rfq_entity_guard()','EXECUTE')
     or has_function_privilege('authenticated','public.fin_event_entity_stamp()','EXECUTE')
     or has_function_privilege('anon','public.fin_entity_visible(uuid,uuid)','EXECUTE')
     or has_function_privilege('anon','public.fin_create_legal_entity(uuid,text,text,text,text,text,text,uuid)','EXECUTE') then
    raise exception 'auxiliar interna exposta ao cliente';
  end if;
  if (select entity_scope from public.fin_members where user_id='00000000-0000-4000-8000-0000000ee003') <> 'group' then
    raise exception 'membro existente não nasceu com escopo de grupo';
  end if;
end $$;

-- 2. Entidades: só admin do grupo cria; unidade só abaixo de entidade legal.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee001',false);
insert into me_ids select 'A', public.fin_create_legal_entity('00000000-0000-4000-8000-0000000ef001','legal_entity','Vitta Alimentos Ltda DEMO','Vitta Alimentos','11222333000181','BR','BRL',null);
insert into me_ids select 'B', public.fin_create_legal_entity('00000000-0000-4000-8000-0000000ef001','legal_entity','Vitta Logística Ltda DEMO','Vitta Log','11444777000161','BR','BRL',null);
insert into me_ids select 'A1', public.fin_create_legal_entity('00000000-0000-4000-8000-0000000ef001','business_unit','Unidade Nordeste DEMO','Nordeste',null,'BR','BRL',(select value from me_ids where key='A'));
insert into me_ids select 'C', public.fin_create_legal_entity('00000000-0000-4000-8000-0000000ef001','legal_entity','Vitta Chile SpA DEMO','Vitta CL',null,'CL','CLP',null);
select pg_temp.expect_error(format($q$select public.fin_create_legal_entity('00000000-0000-4000-8000-0000000ef001','business_unit','Sub-unidade DEMO',null,null,'BR','BRL','%s')$q$, (select value from me_ids where key='A1')), 'invalid legal entity');
select pg_temp.expect_error($q$select public.fin_create_legal_entity('00000000-0000-4000-8000-0000000ef001','legal_entity','CNPJ repetido DEMO',null,'11222333000181','BR','BRL',null)$q$, 'legal entity conflict');
select pg_temp.expect_error($q$select public.fin_create_legal_entity('00000000-0000-4000-8000-0000000ef001','legal_entity','Moeda inválida DEMO',null,null,'BR','reais',null)$q$, 'invalid legal entity');
select pg_temp.expect_error($q$select public.fin_set_base_currency('00000000-0000-4000-8000-0000000ef001','usd')$q$, 'invalid currency');
select public.fin_set_base_currency('00000000-0000-4000-8000-0000000ef001','BRL');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee002',false);
select pg_temp.expect_error($q$select public.fin_create_legal_entity('00000000-0000-4000-8000-0000000ef001','legal_entity','Gestor não cria DEMO',null,null,'BR','BRL',null)$q$, 'forbidden');
select pg_temp.expect_error($q$select public.fin_set_base_currency('00000000-0000-4000-8000-0000000ef001','USD')$q$, 'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee006',false);
select pg_temp.expect_error($q$select public.fin_create_legal_entity('00000000-0000-4000-8000-0000000ef001','legal_entity','Outro tenant DEMO',null,null,'BR','BRL',null)$q$, 'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee007',false);
select pg_temp.expect_error($q$select public.fin_create_legal_entity('00000000-0000-4000-8000-0000000ef003','legal_entity','Provedor DEMO',null,null,'BR','BRL',null)$q$, 'forbidden');

-- 3. Escopos: admin restringe gestores e o aprovador; admin não pode ser restrito.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee001',false);
select public.fin_set_member_entity_scope('00000000-0000-4000-8000-0000000ef001','00000000-0000-4000-8000-0000000ee003','entities',array[(select value from me_ids where key='A')]);
select public.fin_set_member_entity_scope('00000000-0000-4000-8000-0000000ef001','00000000-0000-4000-8000-0000000ee004','entities',array[(select value from me_ids where key='B')]);
select public.fin_set_member_entity_scope('00000000-0000-4000-8000-0000000ef001','00000000-0000-4000-8000-0000000ee005','entities',array[(select value from me_ids where key='A')]);
select pg_temp.expect_error($q$select public.fin_set_member_entity_scope('00000000-0000-4000-8000-0000000ef001','00000000-0000-4000-8000-0000000ee001','entities',array[(select value from me_ids where key='A')])$q$, 'invalid scope');
select pg_temp.expect_error($q$select public.fin_set_member_entity_scope('00000000-0000-4000-8000-0000000ef001','00000000-0000-4000-8000-0000000ee002','entities','{}'::uuid[])$q$, 'invalid scope');
select pg_temp.expect_error($q$select public.fin_set_member_entity_scope('00000000-0000-4000-8000-0000000ef001','00000000-0000-4000-8000-0000000ee002','entities',array['00000000-0000-4000-8000-0000000ef010'::uuid])$q$, 'invalid scope');
select pg_temp.expect_error($q$select public.fin_set_member_entity_scope('00000000-0000-4000-8000-0000000ef001','00000000-0000-4000-8000-0000000ee008','group','{}'::uuid[])$q$, 'member not found');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee002',false);
select pg_temp.expect_error($q$select public.fin_set_member_entity_scope('00000000-0000-4000-8000-0000000ef001','00000000-0000-4000-8000-0000000ee004','group','{}'::uuid[])$q$, 'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee006',false);
select pg_temp.expect_error($q$select public.fin_set_member_entity_scope('00000000-0000-4000-8000-0000000ef001','00000000-0000-4000-8000-0000000ee004','group','{}'::uuid[])$q$, 'forbidden');
reset role;
do $$ begin
  -- Mesmo o dono do banco não deixa um admin com escopo restrito.
  update public.fin_members set entity_scope='entities' where user_id='00000000-0000-4000-8000-0000000ee001';
  raise exception 'admin restrito aceito';
exception when check_violation then null; end $$;

-- 4. Criação de RFQ: grupo cria sem entidade ou em qualquer uma; restrito só na dele.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee002',false);
insert into me_ids select 'rfq_group', public.fin_create_rfq('00000000-0000-4000-8000-0000000ef001','credit','Capital de giro grupo DEMO',null,'{"amount":1000000}'::jsonb,null);
insert into me_ids select 'rfq_b', public.fin_create_rfq_in_entity('00000000-0000-4000-8000-0000000ef001',(select value from me_ids where key='B'),'credit','Frota logística DEMO',null,'{"amount":2000000}'::jsonb,null,null);
insert into me_ids select 'rfq_a1', public.fin_create_rfq_in_entity('00000000-0000-4000-8000-0000000ef001',(select value from me_ids where key='A1'),'acquiring','Adquirência Nordeste DEMO',null,'{"monthly_volume":300000}'::jsonb,null,null);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee003',false);
insert into me_ids select 'rfq_a', public.fin_create_rfq_in_entity('00000000-0000-4000-8000-0000000ef001',(select value from me_ids where key='A'),'credit','Capital de giro Alimentos DEMO',null,'{"amount":500000}'::jsonb,null,null);
select pg_temp.expect_error($q$select public.fin_create_rfq('00000000-0000-4000-8000-0000000ef001','credit','Restrito sem entidade DEMO',null,'{}'::jsonb,null)$q$, 'forbidden');
select pg_temp.expect_error($q$select public.fin_create_rfq_in_entity('00000000-0000-4000-8000-0000000ef001',(select value from me_ids where key='B'),'credit','Restrito em B DEMO',null,'{}'::jsonb,null,null)$q$, 'forbidden');
select pg_temp.expect_error($q$select public.fin_create_rfq_in_entity('00000000-0000-4000-8000-0000000ef001',null,'credit','Sem entidade DEMO',null,'{}'::jsonb,null,null)$q$, 'invalid legal entity');
-- Entidade de outro tenant não é aceita nem pelo admin dele.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee006',false);
select pg_temp.expect_error($q$select public.fin_create_rfq_in_entity('00000000-0000-4000-8000-0000000ef002',(select value from me_ids where key='A'),'credit','Entidade alheia DEMO',null,'{}'::jsonb,null,null)$q$, 'invalid legal entity');
reset role;
do $$ begin
  if (select legal_entity_id from public.fin_rfqs where id=(select value from me_ids where key='rfq_a')) <> (select value from me_ids where key='A')
     or (select legal_entity_id from public.fin_rfqs where id=(select value from me_ids where key='rfq_a1')) <> (select value from me_ids where key='A1')
     or (select legal_entity_id from public.fin_rfqs where id=(select value from me_ids where key='rfq_group')) is not null then
    raise exception 'entidade da RFQ não gravada';
  end if;
  if current_setting('arandu.legal_entity', true) not in ('') and current_setting('arandu.legal_entity', true) is not null then
    raise exception 'contexto de entidade vazou para fora da RPC';
  end if;
  -- Trilha: o evento de criação carrega a entidade em que a ação ocorreu.
  if (select legal_entity_id from public.fin_events where entity_type='rfq' and entity_id=(select value from me_ids where key='rfq_a') and event_type='rfq_created')
       <> (select value from me_ids where key='A') then
    raise exception 'evento sem a entidade do objeto';
  end if;
end $$;

-- 5. Leitura: cada escopo vê exatamente o que alcança (unidade herda da entidade).
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee003',false);
do $$ begin
  if (select string_agg(title, '|' order by title) from public.fin_rfqs where organization_id='00000000-0000-4000-8000-0000000ef001')
     <> 'Adquirência Nordeste DEMO|Capital de giro Alimentos DEMO' then
    raise exception 'gestor de A vê RFQs fora do escopo: %', (select string_agg(title, '|') from public.fin_rfqs);
  end if;
  if (select string_agg(short_name, '|' order by short_name) from public.fin_legal_entities) <> 'Nordeste|Vitta Alimentos' then
    raise exception 'gestor de A enxerga entidades fora do escopo';
  end if;
  if exists (select 1 from public.fin_events where legal_entity_id is distinct from (select value from me_ids where key='A')
             and legal_entity_id is distinct from (select value from me_ids where key='A1')) then
    raise exception 'gestor de A lê trilha de outra entidade ou do grupo';
  end if;
  if (select count(*) from public.fin_search('00000000-0000-4000-8000-0000000ef001','demo',null,30,0) where kind='rfq') <> 2 then
    raise exception 'busca do gestor de A atravessou o escopo';
  end if;
  -- Concessões: cada um lê só a própria.
  if (select count(*) from public.fin_member_entity_grants) <> 1 then raise exception 'concessões alheias legíveis'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee004',false);
do $$ begin
  if (select count(*) from public.fin_rfqs) <> 1 or (select title from public.fin_rfqs) <> 'Frota logística DEMO' then
    raise exception 'gestor de B vê RFQs fora do escopo';
  end if;
  if (select count(*) from public.fin_legal_entities) <> 1 then raise exception 'gestor de B enxerga outras entidades'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee002',false);
do $$ begin
  if (select count(*) from public.fin_rfqs where organization_id='00000000-0000-4000-8000-0000000ef001') <> 4 then raise exception 'grupo não vê todas as RFQs'; end if;
  if (select count(*) from public.fin_legal_entities) <> 4 then raise exception 'grupo não vê todas as entidades'; end if;
  if (select count(*) from public.fin_member_entity_grants) <> 0 then raise exception 'gestor não admin lê concessões alheias'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee001',false);
do $$ begin
  if (select count(*) from public.fin_member_entity_grants where organization_id='00000000-0000-4000-8000-0000000ef001') <> 3 then raise exception 'admin não lê concessões'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee006',false);
do $$ begin
  if exists (select 1 from public.fin_legal_entities) or exists (select 1 from public.fin_rfqs where organization_id='00000000-0000-4000-8000-0000000ef001')
     or exists (select 1 from public.fin_member_entity_grants) then
    raise exception 'outro tenant enxerga entidades ou RFQs do grupo';
  end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee008',false);
do $$ begin
  if exists (select 1 from public.fin_legal_entities) or exists (select 1 from public.fin_rfqs) then raise exception 'externo enxerga dado'; end if;
end $$;

-- 6. Escrita por RPC existente fora do escopo: a guarda central recusa.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee003',false);
select pg_temp.expect_error(format($q$select public.fin_transition('rfq','%s','open')$q$, (select value from me_ids where key='rfq_b')), 'forbidden');
select pg_temp.expect_error(format($q$select public.fin_set_rfq_entity('%s','%s')$q$, (select value from me_ids where key='rfq_b'), (select value from me_ids where key='A')), 'forbidden');
select pg_temp.expect_error(format($q$select public.fin_set_rfq_entity('%s','%s')$q$, (select value from me_ids where key='rfq_a'), (select value from me_ids where key='B')), 'forbidden');
select pg_temp.expect_error(format($q$select public.fin_invite_provider('%s','00000000-0000-4000-8000-0000000ef010')$q$, (select value from me_ids where key='rfq_b')), 'forbidden');
select pg_temp.expect_error(format($q$select public.fin_add_comment('rfq','%s','internal','Comentário fora do escopo')$q$, (select value from me_ids where key='rfq_b')), 'forbidden');
select pg_temp.expect_error(format($q$insert into public.fin_tasks(organization_id,title,related_type,related_id,created_by) values ('00000000-0000-4000-8000-0000000ef001','Tarefa em B','rfq','%s','00000000-0000-4000-8000-0000000ee003')$q$, (select value from me_ids where key='rfq_b')), 'forbidden');
-- Dentro do escopo: transição, comentário e tarefa avulsa funcionam.
select public.fin_transition('rfq',(select value from me_ids where key='rfq_a'),'open');
select public.fin_add_comment('rfq',(select value from me_ids where key='rfq_a'),'internal','Comentário da entidade A');
insert into public.fin_tasks(organization_id,title,created_by) values ('00000000-0000-4000-8000-0000000ef001','Tarefa pessoal do gestor A','00000000-0000-4000-8000-0000000ee003');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee004',false);
do $$ begin
  if exists (select 1 from public.fin_comments) then raise exception 'gestor de B lê comentário de A'; end if;
  if exists (select 1 from public.fin_tasks where title='Tarefa pessoal do gestor A') then raise exception 'tarefa pessoal alheia legível'; end if;
end $$;
-- Mudança de entidade fora da RPC é recusada mesmo para o dono do banco com sessão.
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee002',false);
select pg_temp.expect_error(format($q$update public.fin_rfqs set legal_entity_id = '%s' where id = '%s'$q$, (select value from me_ids where key='B'), (select value from me_ids where key='rfq_a')), 'legal entity change requires rpc');
select set_config('request.jwt.claim.sub','',false);

-- 7. Reatribuição auditada pelo grupo: a RFQ do grupo passa para A.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee002',false);
select public.fin_set_rfq_entity((select value from me_ids where key='rfq_group'),(select value from me_ids where key='A'));
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee003',false);
do $$ begin
  if not exists (select 1 from public.fin_rfqs where id=(select value from me_ids where key='rfq_group')) then raise exception 'reatribuição não chegou ao gestor de A'; end if;
  if not exists (select 1 from public.fin_events where event_type='rfq_entity_changed' and entity_id=(select value from me_ids where key='rfq_group')) then
    raise exception 'reatribuição sem trilha';
  end if;
end $$;

-- 8. Aprovação, decisão e contrato: aprovador precisa alcançar a entidade.
reset role;
select set_config('request.jwt.claim.sub','',false);
insert into public.fin_rfq_invites(id,buyer_organization_id,rfq_id,provider_id,provider_organization_id,token_hash,created_by,status,recipient_mode)
select '00000000-0000-4000-8000-0000000ef020','00000000-0000-4000-8000-0000000ef001',value,'00000000-0000-4000-8000-0000000ef010',
       '00000000-0000-4000-8000-0000000ef003',encode(sha256(convert_to('multi-entity-invite-a','UTF8')),'hex'),'00000000-0000-4000-8000-0000000ee002','accepted','organization_open'
  from me_ids where key='rfq_a';
insert into public.fin_proposals(id,invite_id,rfq_id,buyer_organization_id,provider_id,provider_organization_id,product,status,current_version)
select '00000000-0000-4000-8000-0000000ef021','00000000-0000-4000-8000-0000000ef020',value,'00000000-0000-4000-8000-0000000ef001',
       '00000000-0000-4000-8000-0000000ef010','00000000-0000-4000-8000-0000000ef003','credit','submitted',1
  from me_ids where key='rfq_a';
insert into public.fin_proposal_versions(proposal_id,version,terms,submitted_by) values
('00000000-0000-4000-8000-0000000ef021',1,'{"interest_rate_month":1.2}'::jsonb,'00000000-0000-4000-8000-0000000ee007');
update public.fin_rfqs set status='collecting' where id=(select value from me_ids where key='rfq_a');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee002',false);
-- Gestor de B não pode ser aprovador de processo da entidade A.
select pg_temp.expect_error(format($q$select public.fin_request_approval('%s','00000000-0000-4000-8000-0000000ef021',array['00000000-0000-4000-8000-0000000ee004'::uuid],'Aprovação A')$q$, (select value from me_ids where key='rfq_a')), 'invalid approver');
insert into me_ids select 'approval', public.fin_request_approval((select value from me_ids where key='rfq_a'),'00000000-0000-4000-8000-0000000ef021',
  array['00000000-0000-4000-8000-0000000ee003'::uuid,'00000000-0000-4000-8000-0000000ee005'::uuid],'Aprovação da entidade A');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee003',false);
select public.fin_act_on_approval((select value from me_ids where key='approval'),'approved',null);
-- O escopo do segundo aprovador é revogado no meio do fluxo: ele não age mais.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee001',false);
select public.fin_set_member_entity_scope('00000000-0000-4000-8000-0000000ef001','00000000-0000-4000-8000-0000000ee005','entities',array[(select value from me_ids where key='B')]);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee005',false);
do $$ begin
  if exists (select 1 from public.fin_approval_requests) then raise exception 'aprovador sem escopo ainda lê o pedido'; end if;
end $$;
select pg_temp.expect_error(format($q$select public.fin_act_on_approval('%s','approved',null)$q$, (select value from me_ids where key='approval')), 'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee001',false);
select public.fin_set_member_entity_scope('00000000-0000-4000-8000-0000000ef001','00000000-0000-4000-8000-0000000ee005','entities',array[(select value from me_ids where key='A')]);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee005',false);
select public.fin_act_on_approval((select value from me_ids where key='approval'),'approved',null);
-- Gestor de B não decide processo de A; gestor de A decide; o contrato herda A.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee004',false);
select pg_temp.expect_error(format($q$select public.fin_record_decision('%s','00000000-0000-4000-8000-0000000ef021','{}'::jsonb,'fora do escopo')$q$, (select value from me_ids where key='rfq_a')), 'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee003',false);
insert into me_ids select 'decision', public.fin_record_decision((select value from me_ids where key='rfq_a'),'00000000-0000-4000-8000-0000000ef021','{}'::jsonb,'Decisão da entidade A');
insert into me_ids select 'contract', public.fin_register_contract((select value from me_ids where key='decision'), current_date, current_date + 40, 60, null, null, null);
select public.fin_process_renewals('00000000-0000-4000-8000-0000000ef001', current_date);
do $$ begin
  if (select legal_entity_id from public.fin_contracts where id=(select value from me_ids where key='contract')) <> (select value from me_ids where key='A') then
    raise exception 'contrato não herdou a entidade da RFQ';
  end if;
  if not exists (select 1 from public.fin_tasks where related_type='contract' and related_id=(select value from me_ids where key='contract')
                 and legal_entity_id=(select value from me_ids where key='A')) then
    raise exception 'tarefa de renovação sem entidade';
  end if;
  if not exists (select 1 from public.fin_renewal_milestones where contract_id=(select value from me_ids where key='contract')) then
    raise exception 'marco de renovação não visível ao gestor da entidade';
  end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee004',false);
do $$ begin
  if exists (select 1 from public.fin_contracts) or exists (select 1 from public.fin_decisions) or exists (select 1 from public.fin_proposals)
     or exists (select 1 from public.fin_proposal_versions) or exists (select 1 from public.fin_renewal_milestones)
     or exists (select 1 from public.fin_tasks where related_type='contract') or exists (select 1 from public.fin_rfq_invites) then
    raise exception 'gestor de B lê detalhe do processo de A';
  end if;
  if public.fin_process_renewals('00000000-0000-4000-8000-0000000ef001', current_date) <> 0 then
    raise exception 'gestor de B processou renovação de contrato de A';
  end if;
  -- Consolidado do gestor de B: só B, sem contagem de A.
  if (select count(*) from public.fin_rfqs where organization_id='00000000-0000-4000-8000-0000000ef001') <> 1 then raise exception 'consolidado de B inclui A'; end if;
end $$;
select pg_temp.expect_error(format($q$select public.fin_start_contract_rfq('%s')$q$, (select value from me_ids where key='contract')), 'forbidden');
do $$ begin
  if exists (select 1 from public.fin_comment_authors('rfq', (select value from me_ids where key='rfq_a'))) then
    raise exception 'autores de comentário de A legíveis para B';
  end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee007',false);
do $$ begin
  -- Provedor segue lendo a própria proposta e a RFQ do convite aceito, sem entidades.
  if not exists (select 1 from public.fin_proposals where id='00000000-0000-4000-8000-0000000ef021') then raise exception 'provedor perdeu a própria proposta'; end if;
  if not exists (select 1 from public.fin_rfqs where id=(select value from me_ids where key='rfq_a')) then raise exception 'provedor perdeu a RFQ do convite'; end if;
  if exists (select 1 from public.fin_legal_entities) or exists (select 1 from public.fin_member_entity_grants) then raise exception 'provedor lê entidades do comprador'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee003',false);
-- Renovação a partir do contrato herda a entidade.
insert into me_ids select 'renewal_rfq', public.fin_start_contract_rfq((select value from me_ids where key='contract'));
do $$ begin
  if (select legal_entity_id from public.fin_rfqs where id=(select value from me_ids where key='renewal_rfq')) <> (select value from me_ids where key='A') then
    raise exception 'RFQ de renovação não herdou a entidade do contrato';
  end if;
end $$;
-- Depois da decisão, a entidade da RFQ é fato do processo.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee002',false);
select pg_temp.expect_error(format($q$select public.fin_set_rfq_entity('%s','%s')$q$, (select value from me_ids where key='rfq_a'), (select value from me_ids where key='B')), 'invalid state');

-- 9. Contrato anterior à fundação: atribuição única, só por escopo de grupo.
reset role;
select set_config('request.jwt.claim.sub','',false);
insert into public.fin_rfqs(id,organization_id,product,title,owner_id,status,demand) values
('00000000-0000-4000-8000-0000000ef030','00000000-0000-4000-8000-0000000ef001','credit','Processo legado DEMO','00000000-0000-4000-8000-0000000ee002','decided','{}'::jsonb);
insert into public.fin_rfq_invites(id,buyer_organization_id,rfq_id,provider_id,provider_organization_id,token_hash,created_by,status,recipient_mode) values
('00000000-0000-4000-8000-0000000ef031','00000000-0000-4000-8000-0000000ef001','00000000-0000-4000-8000-0000000ef030','00000000-0000-4000-8000-0000000ef010',
 '00000000-0000-4000-8000-0000000ef003',encode(sha256(convert_to('multi-entity-invite-legacy','UTF8')),'hex'),'00000000-0000-4000-8000-0000000ee002','accepted','organization_open');
insert into public.fin_proposals(id,invite_id,rfq_id,buyer_organization_id,provider_id,provider_organization_id,product,status,current_version) values
('00000000-0000-4000-8000-0000000ef032','00000000-0000-4000-8000-0000000ef031','00000000-0000-4000-8000-0000000ef030','00000000-0000-4000-8000-0000000ef001',
 '00000000-0000-4000-8000-0000000ef010','00000000-0000-4000-8000-0000000ef003','credit','submitted',1);
insert into public.fin_decisions(id,organization_id,rfq_id,proposal_id,decided_by,snapshot) values
('00000000-0000-4000-8000-0000000ef033','00000000-0000-4000-8000-0000000ef001','00000000-0000-4000-8000-0000000ef030','00000000-0000-4000-8000-0000000ef032','00000000-0000-4000-8000-0000000ee002','{}'::jsonb);
insert into public.fin_contracts(id,organization_id,decision_id,proposal_id,provider_id,product,starts_on,ends_on,owner_id) values
('00000000-0000-4000-8000-0000000ef034','00000000-0000-4000-8000-0000000ef001','00000000-0000-4000-8000-0000000ef033','00000000-0000-4000-8000-0000000ef032',
 '00000000-0000-4000-8000-0000000ef010','credit',current_date - 300,current_date + 300,'00000000-0000-4000-8000-0000000ee002');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee003',false);
select pg_temp.expect_error($q$select public.fin_assign_contract_entity('00000000-0000-4000-8000-0000000ef034',(select value from me_ids where key='A'))$q$, 'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee002',false);
select public.fin_assign_contract_entity('00000000-0000-4000-8000-0000000ef034',(select value from me_ids where key='B'));
select pg_temp.expect_error($q$select public.fin_assign_contract_entity('00000000-0000-4000-8000-0000000ef034',(select value from me_ids where key='A'))$q$, 'legal entity already assigned');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee004',false);
do $$ begin
  if not exists (select 1 from public.fin_contracts where id='00000000-0000-4000-8000-0000000ef034') then raise exception 'contrato atribuído a B invisível para B'; end if;
end $$;

-- 10. Arquivar: entidade com unidade ativa não arquiva; arquivada não recebe processo.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee001',false);
select pg_temp.expect_error($q$select public.fin_update_legal_entity((select value from me_ids where key='A'),null,null,null,'archived')$q$, 'legal entity has active units');
select public.fin_update_legal_entity((select value from me_ids where key='C'),null,null,null,'archived');
select pg_temp.expect_error($q$select public.fin_create_rfq_in_entity('00000000-0000-4000-8000-0000000ef001',(select value from me_ids where key='C'),'credit','Entidade arquivada DEMO',null,'{}'::jsonb,null,null)$q$, 'invalid legal entity');
select pg_temp.expect_error($q$select public.fin_set_member_entity_scope('00000000-0000-4000-8000-0000000ef001','00000000-0000-4000-8000-0000000ee004','entities',array[(select value from me_ids where key='C')])$q$, 'invalid scope');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee002',false);
select pg_temp.expect_error($q$select public.fin_update_legal_entity((select value from me_ids where key='B'),'Renomear sem ser admin',null,null,null)$q$, 'forbidden');
reset role;
do $$ begin
  if (select status || '/' || (archived_at is not null)::text from public.fin_legal_entities where id=(select value from me_ids where key='C')) <> 'archived/true' then
    raise exception 'arquivamento sem data';
  end if;
  if not exists (select 1 from public.fin_events where event_type='legal_entity_archived' and entity_id=(select value from me_ids where key='C')) then
    raise exception 'arquivamento sem trilha';
  end if;
  if not exists (select 1 from public.fin_events where event_type='member_entity_scope_set' and metadata->>'scope'='entities') then
    raise exception 'mudança de escopo sem trilha';
  end if;
  -- A trilha guarda contagem, nunca a lista de entidades nem dado financeiro.
  if exists (select 1 from public.fin_events where event_type like 'legal_entity_%' and metadata::text ~ '[0-9]{14}') then
    raise exception 'CNPJ vazou para a trilha';
  end if;
end $$;
select set_config('request.jwt.claim.sub','',false);

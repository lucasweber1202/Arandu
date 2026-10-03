\set ON_ERROR_STOP on
-- Policy & Approval Engine v2 (docs/supabase-financial-policy-engine.sql):
-- versões imutáveis, global + local, avaliação determinística, requisitos no
-- pedido (snapshot), mudança de policy não altera processo em andamento,
-- grupo de aprovadores (tesouraria do grupo), mínimo de propostas com
-- justificativa, segregação de funções, prazo e escalação idempotente.
insert into auth.users(id,email) values
('00000000-0000-4000-8000-0000000bb101','pe-admin@example.invalid'),
('00000000-0000-4000-8000-0000000bb102','pe-requester@example.invalid'),
('00000000-0000-4000-8000-0000000bb103','pe-group-approver@example.invalid'),
('00000000-0000-4000-8000-0000000bb104','pe-local-approver@example.invalid'),
('00000000-0000-4000-8000-0000000bb105','pe-other@example.invalid'),
('00000000-0000-4000-8000-0000000bb106','pe-group-viewer@example.invalid')
on conflict(id) do nothing;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-0000000bc001','Grupo policy DEMO','BUYER','00000000-0000-4000-8000-0000000bb101'),
('00000000-0000-4000-8000-0000000bc002','Outro policy DEMO','BUYER','00000000-0000-4000-8000-0000000bb105'),
('00000000-0000-4000-8000-0000000bc003','Banco policy DEMO','PROVIDER','00000000-0000-4000-8000-0000000bb101');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-0000000bc001','00000000-0000-4000-8000-0000000bb101','admin'),
('00000000-0000-4000-8000-0000000bc001','00000000-0000-4000-8000-0000000bb102','finance_manager'),
('00000000-0000-4000-8000-0000000bc001','00000000-0000-4000-8000-0000000bb103','finance_manager'),
('00000000-0000-4000-8000-0000000bc001','00000000-0000-4000-8000-0000000bb104','viewer'),
('00000000-0000-4000-8000-0000000bc001','00000000-0000-4000-8000-0000000bb106','viewer'),
('00000000-0000-4000-8000-0000000bc002','00000000-0000-4000-8000-0000000bb105','admin');
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
('00000000-0000-4000-8000-0000000bc010','00000000-0000-4000-8000-0000000bc001','Banco novo DEMO','bank','00000000-0000-4000-8000-0000000bb101');

create temporary table pe_ids(key text primary key, value uuid);
grant all on pe_ids to authenticated;
create or replace function pg_temp.expect_error(p_sql text, p_message text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'esperava falha "%" em: %', p_message, p_sql;
exception when others then
  if sqlerrm not like p_message || '%' then raise exception 'falha inesperada em %: % (esperava %)', p_sql, sqlerrm, p_message; end if;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated;

do $$ begin
  if has_table_privilege('authenticated','public.fin_policy_versions','INSERT') or has_table_privilege('authenticated','public.fin_policy_versions','UPDATE')
     or has_function_privilege('authenticated','public.fin_evaluate_policies(uuid,uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.fin_run_approval_deadlines()','EXECUTE') then
    raise exception 'policy gravável/avaliável fora do caminho previsto';
  end if;
end $$;

-- Entidade A e o aprovador local restrito a A.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000bb101',false);
insert into pe_ids select 'A', public.fin_create_legal_entity('00000000-0000-4000-8000-0000000bc001','legal_entity','Policy A DEMO','A',null,'BR','BRL',null);
select public.fin_set_member_entity_scope('00000000-0000-4000-8000-0000000bc001','00000000-0000-4000-8000-0000000bb104','entities',array[(select value from pe_ids where key='A')]);

-- 1. Publicação: só admin, regras validadas, versão nova aposenta a anterior.
select pg_temp.expect_error($q$select public.fin_publish_policy('00000000-0000-4000-8000-0000000bc001','grande','Grande',null,'[{"id":"r1","label":"Regra","when":{"amount_gte":"muito"},"require":{"approvals":2}}]'::jsonb)$q$, 'invalid policy');
select pg_temp.expect_error($q$select public.fin_publish_policy('00000000-0000-4000-8000-0000000bc001','grande','Grande',null,'[{"id":"r1","label":"Regra","when":{"ranking":1},"require":{"approvals":2}}]'::jsonb)$q$, 'invalid policy');
select pg_temp.expect_error($q$select public.fin_publish_policy('00000000-0000-4000-8000-0000000bc001','grande','Grande',null,'[{"id":"r1","label":"Regra","when":{},"require":{"escalate_to":"00000000-0000-4000-8000-0000000bb105"}}]'::jsonb)$q$, 'invalid policy');
insert into pe_ids select 'global_v1', public.fin_publish_policy('00000000-0000-4000-8000-0000000bc001','alcadas','Alçadas do grupo',null,
 '[{"id":"acima_5mi","label":"Crédito acima de R$ 5 mi","when":{"products":["credit"],"amount_gte":5000000},
    "require":{"approvals":2,"approver_groups":[{"roles":["admin","finance_manager"],"scope":"group","label":"Tesouraria do grupo"}],"step_hours":24,"escalate_to":"00000000-0000-4000-8000-0000000bb101","sod_decider":true}},
   {"id":"poucas","label":"Menos de 3 propostas","when":{"proposals_lt":3},"require":{"min_proposals":3,"justification":true}}]'::jsonb);
insert into pe_ids select 'local', public.fin_publish_policy('00000000-0000-4000-8000-0000000bc001','local_a','Política local A',(select value from pe_ids where key='A'),
 '[{"id":"provedor_novo","label":"Provedor novo","when":{"provider_new":true},"require":{"approval_required":true}}]'::jsonb);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000bb102',false);
select pg_temp.expect_error($q$select public.fin_publish_policy('00000000-0000-4000-8000-0000000bc001','x','Gestor',null,'[{"id":"r1","label":"Regra","when":{},"require":{"approvals":1}}]'::jsonb)$q$, 'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000bb105',false);
do $$ begin if exists (select 1 from public.fin_policy_versions) then raise exception 'outro tenant lê policies'; end if; end $$;
reset role;
do $$ begin
  update public.fin_policy_versions set rules='[]'::jsonb;
  raise exception 'regra de policy reescrita';
exception when others then if sqlerrm <> 'immutable record' then raise; end if; end $$;

-- 2. Processo grande na entidade A, provedor novo, uma proposta.
select set_config('request.jwt.claim.sub','',false);
insert into public.fin_rfqs(id,organization_id,product,title,owner_id,status,demand,legal_entity_id)
select '00000000-0000-4000-8000-0000000bc020','00000000-0000-4000-8000-0000000bc001','credit','Capital de giro grande DEMO','00000000-0000-4000-8000-0000000bb102','collecting',
  '{"amount":8000000,"term_months":24}'::jsonb, value from pe_ids where key='A';
insert into public.fin_rfq_invites(id,buyer_organization_id,rfq_id,provider_id,provider_organization_id,token_hash,created_by,status,recipient_mode) values
('00000000-0000-4000-8000-0000000bc021','00000000-0000-4000-8000-0000000bc001','00000000-0000-4000-8000-0000000bc020','00000000-0000-4000-8000-0000000bc010',
 '00000000-0000-4000-8000-0000000bc003',encode(sha256(convert_to('policy-engine-invite','UTF8')),'hex'),'00000000-0000-4000-8000-0000000bb102','accepted','organization_open');
insert into public.fin_proposals(id,invite_id,rfq_id,buyer_organization_id,provider_id,provider_organization_id,product,status,current_version) values
('00000000-0000-4000-8000-0000000bc022','00000000-0000-4000-8000-0000000bc021','00000000-0000-4000-8000-0000000bc020','00000000-0000-4000-8000-0000000bc001',
 '00000000-0000-4000-8000-0000000bc010','00000000-0000-4000-8000-0000000bc003','credit','submitted',1);
insert into public.fin_proposal_versions(proposal_id,version,terms,submitted_by) values
('00000000-0000-4000-8000-0000000bc022',1,'{"interest_rate_month":1.3,"term_months":24}'::jsonb,'00000000-0000-4000-8000-0000000bb101');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000bb102',false);
do $$ declare v jsonb := public.fin_preview_policy('00000000-0000-4000-8000-0000000bc020','00000000-0000-4000-8000-0000000bc022'); begin
  if (v->'requirements'->>'approvals')::int <> 2 or not (v->'requirements'->>'approval_required')::boolean
     or not (v->'requirements'->>'justification_required')::boolean or (v->'requirements'->>'min_proposals')::int <> 3
     or (v->'requirements'->>'step_hours')::int <> 24 or not (v->'requirements'->>'sod_decider')::boolean
     or jsonb_array_length(v->'matched') <> 3 or not (v->'context'->>'provider_new')::boolean then
    raise exception 'avaliação incorreta: %', v;
  end if;
end $$;
-- Sem pedido aprovado, a decisão é recusada pela policy.
select pg_temp.expect_error($q$select public.fin_record_decision('00000000-0000-4000-8000-0000000bc020','00000000-0000-4000-8000-0000000bc022','{}'::jsonb,'Decisão sem aprovação')$q$, 'approval required or stale');
-- Um aprovador só: abaixo do mínimo.
select pg_temp.expect_error($q$select public.fin_request_approval('00000000-0000-4000-8000-0000000bc020','00000000-0000-4000-8000-0000000bc022',array['00000000-0000-4000-8000-0000000bb103'::uuid],'Pedido')$q$, 'policy approvers required');
-- Dois aprovadores, nenhum da tesouraria do grupo (leitura/aprovação não basta).
select pg_temp.expect_error($q$select public.fin_request_approval_v2('00000000-0000-4000-8000-0000000bc020','00000000-0000-4000-8000-0000000bc022',array['00000000-0000-4000-8000-0000000bb104'::uuid,'00000000-0000-4000-8000-0000000bb106'::uuid],'Pedido','Mercado restrito para este valor e prazo.')$q$, 'policy approver group missing');
-- Faltou justificativa para menos de 3 propostas.
select pg_temp.expect_error($q$select public.fin_request_approval_v2('00000000-0000-4000-8000-0000000bc020','00000000-0000-4000-8000-0000000bc022',array['00000000-0000-4000-8000-0000000bb104'::uuid,'00000000-0000-4000-8000-0000000bb103'::uuid],'Pedido',null)$q$, 'policy justification required');
insert into pe_ids select 'request', public.fin_request_approval_v2('00000000-0000-4000-8000-0000000bc020','00000000-0000-4000-8000-0000000bc022',
  array['00000000-0000-4000-8000-0000000bb104'::uuid,'00000000-0000-4000-8000-0000000bb103'::uuid],'Pedido de aprovação','Só um banco ofertou no prazo; os demais declinaram.');

-- 3. Mudar a policy depois do pedido não altera o processo em andamento.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000bb101',false);
insert into pe_ids select 'global_v2', public.fin_publish_policy('00000000-0000-4000-8000-0000000bc001','alcadas','Alçadas do grupo',null,
 '[{"id":"tudo","label":"Tudo exige 5 aprovadores","when":{},"require":{"approvals":5}}]'::jsonb);
reset role;
do $$ begin
  if (select status from public.fin_policy_versions where id=(select value from pe_ids where key='global_v1')) <> 'retired' then raise exception 'v1 não aposentada'; end if;
  if (select (policy_evaluation->'requirements'->>'approvals')::int from public.fin_approval_requests where id=(select value from pe_ids where key='request')) <> 2 then
    raise exception 'pedido em andamento acompanhou a nova policy';
  end if;
  if (select due_at from public.fin_approval_steps where request_id=(select value from pe_ids where key='request') and position=1) is null
     or (select due_at from public.fin_approval_steps where request_id=(select value from pe_ids where key='request') and position=2) is not null then
    raise exception 'prazo da primeira etapa';
  end if;
end $$;

-- 4. Prazo vencido escala uma vez (avisa quem a policy indicou).
update public.fin_approval_steps set due_at = now() - interval '1 hour' where request_id=(select value from pe_ids where key='request') and position=1;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000bb102',false);
do $$ begin
  if public.fin_process_approval_deadlines('00000000-0000-4000-8000-0000000bc001') <> 1 then raise exception 'etapa vencida não escalou'; end if;
  if public.fin_process_approval_deadlines('00000000-0000-4000-8000-0000000bc001') <> 0 then raise exception 'escalação duplicada'; end if;
end $$;
select pg_temp.expect_error($q$select public.fin_process_approval_deadlines(null)$q$, 'forbidden');
reset role;
do $$ begin
  if not exists (select 1 from public.fin_notifications where user_id='00000000-0000-4000-8000-0000000bb101' and title='Aprovação em atraso') then raise exception 'escalação sem aviso'; end if;
end $$;

-- 5. Aprovação sequencial; a etapa 2 ganha prazo; SoD na decisão.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000bb104',false);
select public.fin_act_on_approval((select value from pe_ids where key='request'),'approved',null);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000bb103',false);
do $$ begin
  if (select due_at from public.fin_approval_steps where request_id=(select value from pe_ids where key='request') and position=2) is null then raise exception 'etapa 2 sem prazo'; end if;
end $$;
select public.fin_act_on_approval((select value from pe_ids where key='request'),'approved',null);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000bb102',false);
select pg_temp.expect_error($q$select public.fin_record_decision('00000000-0000-4000-8000-0000000bc020','00000000-0000-4000-8000-0000000bc022','{}'::jsonb,'Quem pediu decide')$q$, 'segregation of duties');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000bb103',false);
insert into pe_ids select 'decision', public.fin_record_decision('00000000-0000-4000-8000-0000000bc020','00000000-0000-4000-8000-0000000bc022','{}'::jsonb,'Decisão da tesouraria');
reset role;
do $$ begin
  if jsonb_array_length((select snapshot->'policy'->'matched' from public.fin_decisions where id=(select value from pe_ids where key='decision'))) <> 3 then
    raise exception 'decisão sem a fotografia da policy aplicada';
  end if;
end $$;

-- 6. Processo pequeno, sem regra aplicável: segue sem aprovação (v2 ativa exige 5 de tudo? só para pedidos novos).
select public.fin_retire_policy((select value from pe_ids where key='global_v2')) from (select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000bb101',false)) s;
select set_config('request.jwt.claim.sub','',false);
insert into public.fin_rfqs(id,organization_id,product,title,owner_id,status,demand) values
('00000000-0000-4000-8000-0000000bc030','00000000-0000-4000-8000-0000000bc001','acquiring','Adquirência pequena DEMO','00000000-0000-4000-8000-0000000bb102','collecting','{"monthly_volume":50000}'::jsonb);
insert into public.fin_rfq_invites(id,buyer_organization_id,rfq_id,provider_id,provider_organization_id,token_hash,created_by,status,recipient_mode) values
('00000000-0000-4000-8000-0000000bc031','00000000-0000-4000-8000-0000000bc001','00000000-0000-4000-8000-0000000bc030','00000000-0000-4000-8000-0000000bc010',
 '00000000-0000-4000-8000-0000000bc003',encode(sha256(convert_to('policy-engine-invite-2','UTF8')),'hex'),'00000000-0000-4000-8000-0000000bb102','accepted','organization_open');
insert into public.fin_proposals(id,invite_id,rfq_id,buyer_organization_id,provider_id,provider_organization_id,product,status,current_version) values
('00000000-0000-4000-8000-0000000bc032','00000000-0000-4000-8000-0000000bc031','00000000-0000-4000-8000-0000000bc030','00000000-0000-4000-8000-0000000bc001',
 '00000000-0000-4000-8000-0000000bc010','00000000-0000-4000-8000-0000000bc003','acquiring','submitted',1);
insert into public.fin_proposal_versions(proposal_id,version,terms,submitted_by) values
('00000000-0000-4000-8000-0000000bc032',1,'{"mdr_debit":1.1}'::jsonb,'00000000-0000-4000-8000-0000000bb101');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000bb102',false);
-- Global v1/v2 aposentadas; local de A não se aplica (processo de grupo). Sem
-- regra, a decisão segue, mas o mínimo de propostas da v1 não vale mais.
insert into pe_ids select 'decision_small', public.fin_record_decision('00000000-0000-4000-8000-0000000bc030','00000000-0000-4000-8000-0000000bc032','{}'::jsonb,null);
reset role;
select set_config('request.jwt.claim.sub','',false);

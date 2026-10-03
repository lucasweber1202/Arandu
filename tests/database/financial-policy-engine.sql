\set ON_ERROR_STOP on
-- Policy & Approval Engine v2 (docs/supabase-financial-policy-engine.sql).
-- Precedência grupo + entidade + fallback, fronteira de moeda/valor, versão
-- imutável, snapshot que não muda com nova versão, plano local -> tesouraria do
-- grupo, SoD, aprovador revogado, delegação, exceção explícita, devolução,
-- substituição, expiração, escalação e negações (outra entidade, outro tenant,
-- provedor).
--
-- Pessoas (grupo Policy DEMO), ids ...0000000c70NN:
--   01 admin do grupo             02 gestão financeira do grupo (tesouraria)
--   03 gestão financeira só A     04 gestão financeira só A (aprovador local)
--   05 analista só A              06 gestão financeira só B
--   07 leitura do grupo           08 admin de outra empresa
--   09 usuário de provedor        10 segundo admin do grupo
insert into auth.users(id,email) values
('00000000-0000-4000-8000-0000000c7001','pol-admin@example.invalid'),
('00000000-0000-4000-8000-0000000c7002','pol-treasury@example.invalid'),
('00000000-0000-4000-8000-0000000c7003','pol-requester-a@example.invalid'),
('00000000-0000-4000-8000-0000000c7004','pol-local-a@example.invalid'),
('00000000-0000-4000-8000-0000000c7005','pol-analyst-a@example.invalid'),
('00000000-0000-4000-8000-0000000c7006','pol-manager-b@example.invalid'),
('00000000-0000-4000-8000-0000000c7007','pol-viewer@example.invalid'),
('00000000-0000-4000-8000-0000000c7008','pol-other-admin@example.invalid'),
('00000000-0000-4000-8000-0000000c7009','pol-provider@example.invalid'),
('00000000-0000-4000-8000-0000000c7010','pol-admin-two@example.invalid')
on conflict(id) do nothing;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-0000000c7101','Grupo policy DEMO','BUYER','00000000-0000-4000-8000-0000000c7001'),
('00000000-0000-4000-8000-0000000c7102','Outro grupo policy DEMO','BUYER','00000000-0000-4000-8000-0000000c7008'),
('00000000-0000-4000-8000-0000000c7103','Banco policy DEMO','PROVIDER','00000000-0000-4000-8000-0000000c7009');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-0000000c7101','00000000-0000-4000-8000-0000000c7001','admin'),
('00000000-0000-4000-8000-0000000c7101','00000000-0000-4000-8000-0000000c7002','finance_manager'),
('00000000-0000-4000-8000-0000000c7101','00000000-0000-4000-8000-0000000c7003','finance_manager'),
('00000000-0000-4000-8000-0000000c7101','00000000-0000-4000-8000-0000000c7004','finance_manager'),
('00000000-0000-4000-8000-0000000c7101','00000000-0000-4000-8000-0000000c7005','analyst'),
('00000000-0000-4000-8000-0000000c7101','00000000-0000-4000-8000-0000000c7006','finance_manager'),
('00000000-0000-4000-8000-0000000c7101','00000000-0000-4000-8000-0000000c7007','viewer'),
('00000000-0000-4000-8000-0000000c7101','00000000-0000-4000-8000-0000000c7010','admin'),
('00000000-0000-4000-8000-0000000c7102','00000000-0000-4000-8000-0000000c7008','admin'),
('00000000-0000-4000-8000-0000000c7103','00000000-0000-4000-8000-0000000c7009','provider_user');
insert into public.fin_legal_entities(id,organization_id,kind,parent_id,legal_name,currency,created_by) values
('00000000-0000-4000-8000-0000000c7201','00000000-0000-4000-8000-0000000c7101','legal_entity',null,'Policy A Ltda DEMO','BRL','00000000-0000-4000-8000-0000000c7001'),
('00000000-0000-4000-8000-0000000c7202','00000000-0000-4000-8000-0000000c7101','legal_entity',null,'Policy B Ltda DEMO','BRL','00000000-0000-4000-8000-0000000c7001'),
('00000000-0000-4000-8000-0000000c7203','00000000-0000-4000-8000-0000000c7101','legal_entity',null,'Policy C Inc DEMO','USD','00000000-0000-4000-8000-0000000c7001');
insert into public.fin_legal_entities(id,organization_id,kind,parent_id,legal_name,currency,created_by) values
('00000000-0000-4000-8000-0000000c7204','00000000-0000-4000-8000-0000000c7101','business_unit','00000000-0000-4000-8000-0000000c7201','Policy A Unidade DEMO','BRL','00000000-0000-4000-8000-0000000c7001');
update public.fin_members set entity_scope='entities' where organization_id='00000000-0000-4000-8000-0000000c7101'
  and user_id in ('00000000-0000-4000-8000-0000000c7003','00000000-0000-4000-8000-0000000c7004','00000000-0000-4000-8000-0000000c7005','00000000-0000-4000-8000-0000000c7006');
insert into public.fin_member_entity_grants(organization_id,user_id,entity_id,granted_by) values
('00000000-0000-4000-8000-0000000c7101','00000000-0000-4000-8000-0000000c7003','00000000-0000-4000-8000-0000000c7201','00000000-0000-4000-8000-0000000c7001'),
('00000000-0000-4000-8000-0000000c7101','00000000-0000-4000-8000-0000000c7004','00000000-0000-4000-8000-0000000c7201','00000000-0000-4000-8000-0000000c7001'),
('00000000-0000-4000-8000-0000000c7101','00000000-0000-4000-8000-0000000c7005','00000000-0000-4000-8000-0000000c7201','00000000-0000-4000-8000-0000000c7001'),
('00000000-0000-4000-8000-0000000c7101','00000000-0000-4000-8000-0000000c7006','00000000-0000-4000-8000-0000000c7202','00000000-0000-4000-8000-0000000c7001');
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
('00000000-0000-4000-8000-0000000c7301','00000000-0000-4000-8000-0000000c7101','Banco policy X DEMO','bank','00000000-0000-4000-8000-0000000c7001'),
('00000000-0000-4000-8000-0000000c7302','00000000-0000-4000-8000-0000000c7101','Banco policy Y DEMO','bank','00000000-0000-4000-8000-0000000c7001');
-- RFQs: R1 em A (BRL 2 mi, uma proposta), R2 em B (BRL 500 mil, uma proposta),
-- R3 em C (USD 5 mi, duas propostas), R4 na unidade de A (BRL 100 mil, duas).
insert into public.fin_rfqs(id,organization_id,product,title,owner_id,status,demand,legal_entity_id) values
('00000000-0000-4000-8000-0000000c7401','00000000-0000-4000-8000-0000000c7101','credit','Policy R1 DEMO','00000000-0000-4000-8000-0000000c7003','comparing','{"amount":2000000,"term_months":24}','00000000-0000-4000-8000-0000000c7201'),
('00000000-0000-4000-8000-0000000c7402','00000000-0000-4000-8000-0000000c7101','credit','Policy R2 DEMO','00000000-0000-4000-8000-0000000c7006','comparing','{"amount":500000,"term_months":12}','00000000-0000-4000-8000-0000000c7202'),
('00000000-0000-4000-8000-0000000c7403','00000000-0000-4000-8000-0000000c7101','credit','Policy R3 DEMO','00000000-0000-4000-8000-0000000c7001','comparing','{"amount":5000000,"term_months":36}','00000000-0000-4000-8000-0000000c7203'),
('00000000-0000-4000-8000-0000000c7404','00000000-0000-4000-8000-0000000c7101','credit','Policy R4 DEMO','00000000-0000-4000-8000-0000000c7003','comparing','{"amount":100000,"term_months":12}','00000000-0000-4000-8000-0000000c7204');
insert into public.fin_rfq_invites(id,buyer_organization_id,rfq_id,provider_id,provider_organization_id,token_hash,created_by,status,recipient_mode)
select ('00000000-0000-4000-8000-0000000c75'||i)::uuid,'00000000-0000-4000-8000-0000000c7101',rfq::uuid,prov::uuid,'00000000-0000-4000-8000-0000000c7103',
       repeat(i,32),'00000000-0000-4000-8000-0000000c7001','accepted','organization_open'
  from (values ('01','00000000-0000-4000-8000-0000000c7401','00000000-0000-4000-8000-0000000c7301'),
               ('02','00000000-0000-4000-8000-0000000c7402','00000000-0000-4000-8000-0000000c7301'),
               ('03','00000000-0000-4000-8000-0000000c7403','00000000-0000-4000-8000-0000000c7301'),
               ('04','00000000-0000-4000-8000-0000000c7403','00000000-0000-4000-8000-0000000c7302'),
               ('05','00000000-0000-4000-8000-0000000c7404','00000000-0000-4000-8000-0000000c7301'),
               ('06','00000000-0000-4000-8000-0000000c7404','00000000-0000-4000-8000-0000000c7302')) v(i,rfq,prov);
insert into public.fin_proposals(id,invite_id,rfq_id,buyer_organization_id,provider_id,provider_organization_id,product,status,current_version)
select ('00000000-0000-4000-8000-0000000c76'||i)::uuid, iv.id, iv.rfq_id, iv.buyer_organization_id, iv.provider_id, iv.provider_organization_id,'credit','submitted',1
  from public.fin_rfq_invites iv cross join lateral (select right(iv.id::text,2) i) x
 where iv.buyer_organization_id='00000000-0000-4000-8000-0000000c7101';
insert into public.fin_proposal_versions(proposal_id,version,terms,submitted_by)
select p.id,1,jsonb_build_object('offered_amount',(r.demand->>'amount')::numeric,'interest_rate_month',1.4,'term_months',(r.demand->>'term_months')::int,
       'collateral_required',case when p.provider_id='00000000-0000-4000-8000-0000000c7302' then 'Cessão fiduciária' else '' end),'00000000-0000-4000-8000-0000000c7009'
  from public.fin_proposals p join public.fin_rfqs r on r.id=p.rfq_id where p.buyer_organization_id='00000000-0000-4000-8000-0000000c7101';

create temporary table pol_ids(key text primary key, value uuid);
grant all on pol_ids to authenticated, service_role;
create or replace function pg_temp.expect_error(p_sql text, p_message text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'esperava falha "%" em: %', p_message, p_sql;
exception when others then
  if sqlerrm not like p_message || '%' then raise exception 'falha inesperada em %: % (esperava %)', p_sql, sqlerrm, p_message; end if;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated, service_role;
create or replace function pg_temp.as_user(p_suffix text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000c70' || p_suffix, false);
$$;
grant execute on function pg_temp.as_user(text) to authenticated, service_role;

-- 1. Superfície: tabelas só por RPC; auxiliares fora do cliente.
do $$ begin
  if has_table_privilege('authenticated','public.fin_policies','INSERT') or has_table_privilege('authenticated','public.fin_policy_versions','UPDATE')
     or has_table_privilege('authenticated','public.fin_approval_stages','UPDATE') or has_table_privilege('authenticated','public.fin_policy_exceptions','INSERT')
     or has_table_privilege('authenticated','public.fin_approval_delegations','INSERT') or has_table_privilege('authenticated','public.fin_policy_flags','INSERT')
     or has_table_privilege('anon','public.fin_policies','SELECT') or has_table_privilege('anon','public.fin_approval_stages','SELECT') then
    raise exception 'escrita direta ou leitura anônima em policy';
  end if;
  if has_function_privilege('authenticated','public.fin_policy_evaluate(uuid,uuid,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.fin_policy_facts(uuid,uuid,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.fin_approval_refresh(uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.fin_approval_member_eligible(uuid,uuid,uuid,text[],text)','EXECUTE')
     or has_function_privilege('authenticated','public.fin_run_approval_deadlines()','EXECUTE')
     or has_function_privilege('anon','public.fin_request_policy_approval(uuid,uuid,jsonb,text,text,jsonb)','EXECUTE') then
    raise exception 'auxiliar de policy exposta ao cliente';
  end if;
end $$;

-- 2. Administração: só admin; documento inválido é recusado.
set role authenticated;
select pg_temp.as_user('02');
select pg_temp.expect_error($q$select public.fin_save_policy_draft('00000000-0000-4000-8000-0000000c7101',null,'Policy do grupo','{"rules":[]}'::jsonb,null)$q$, 'forbidden');
select pg_temp.as_user('01');
-- valor sem moeda; fato desconhecido; regra duplicada; mesma chave de etapa com
-- significados diferentes; regra que não exige nada; HTML.
select pg_temp.expect_error($q$select public.fin_save_policy_draft('00000000-0000-4000-8000-0000000c7101',null,'Grupo','{"rules":[{"id":"x1","label":"Valor","when":[{"fact":"amount","op":"gte","value":10}],"stages":[{"key":"t","label":"Tesouraria","sequence":1,"roles":["admin"],"scope":"group","min_approvals":1}]}]}'::jsonb,null)$q$, 'invalid policy');
select pg_temp.expect_error($q$select public.fin_save_policy_draft('00000000-0000-4000-8000-0000000c7101',null,'Grupo','{"rules":[{"id":"x1","label":"Score","when":[{"fact":"arandu_score","op":"gte","value":10}],"stages":[{"key":"tt","label":"Tesouraria","sequence":1,"roles":["admin"],"scope":"group","min_approvals":1}]}]}'::jsonb,null)$q$, 'invalid policy');
select pg_temp.expect_error($q$select public.fin_save_policy_draft('00000000-0000-4000-8000-0000000c7101',null,'Grupo','{"rules":[{"id":"x1","label":"Uma","stages":[{"key":"tt","label":"T","sequence":1,"roles":["admin"],"scope":"group","min_approvals":1}]},{"id":"x1","label":"Duas","stages":[{"key":"tt","label":"Tesouraria","sequence":1,"roles":["admin"],"scope":"group","min_approvals":1}]}]}'::jsonb,null)$q$, 'invalid policy');
select pg_temp.expect_error($q$select public.fin_save_policy_draft('00000000-0000-4000-8000-0000000c7101',null,'Grupo','{"rules":[{"id":"x1","label":"Uma","stages":[{"key":"tt","label":"Tesouraria","sequence":1,"roles":["admin"],"scope":"group","min_approvals":1}]},{"id":"x2","label":"Duas","stages":[{"key":"tt","label":"Tesouraria","sequence":2,"roles":["admin"],"scope":"group","min_approvals":1}]}]}'::jsonb,null)$q$, 'invalid policy');
select pg_temp.expect_error($q$select public.fin_save_policy_draft('00000000-0000-4000-8000-0000000c7101',null,'Grupo','{"rules":[{"id":"x1","label":"Vazia","when":[]}]}'::jsonb,null)$q$, 'invalid policy');
select pg_temp.expect_error($q$select public.fin_save_policy_draft('00000000-0000-4000-8000-0000000c7101',null,'Grupo','{"rules":[{"id":"x1","label":"<b>x</b>","requirements":{"justification":true}}]}'::jsonb,null)$q$, 'invalid policy');
select pg_temp.expect_error($q$select public.fin_save_policy_draft('00000000-0000-4000-8000-0000000c7101',null,'Grupo','{"rules":[{"id":"x1","label":"Data","when":[{"fact":"maturity_date","op":"after","value":"2030-02-30"}],"requirements":{"justification":true}}]}'::jsonb,null)$q$, 'invalid policy');

-- Policy do grupo v1: acima de R$ 1 mi, tesouraria do grupo (sequência 2);
-- crédito exige ao menos 2 propostas; quem pede não registra a decisão.
insert into pol_ids select 'group_v1', public.fin_save_policy_draft('00000000-0000-4000-8000-0000000c7101', null, 'Alçadas do grupo', $j${
  "rules": [
    {"id":"above_1m","label":"Acima de R$ 1 milhão exige tesouraria do grupo",
     "when":[{"fact":"amount","op":"gte","value":1000000,"currency":"BRL"}],
     "stages":[{"key":"group_treasury","label":"Tesouraria do grupo","sequence":2,"roles":["admin","finance_manager"],"scope":"group","min_approvals":1,"due_hours":24}]},
    {"id":"competition","label":"Crédito exige ao menos duas propostas","when":[{"fact":"product","op":"in","value":["credit"]}],
     "requirements":{"min_proposals":2}}
  ],
  "sod":{"requester_cannot_decide":true},
  "exception_approver_roles":["admin"],
  "expire_after_hours":336
}$j$::jsonb, 'Primeira versão');
-- Rascunho não vale e não aparece para quem não é admin.
select pg_temp.as_user('02');
do $$ begin
  if exists (select 1 from public.fin_policy_versions) then raise exception 'rascunho visível para não admin'; end if;
  if public.fin_preview_approval_policy('00000000-0000-4000-8000-0000000c7402', null, '{}'::jsonb)->>'engine' <> 'legacy' then raise exception 'rascunho aplicado'; end if;
end $$;
select pg_temp.as_user('01');
select public.fin_activate_policy_version((select value from pol_ids where key='group_v1'));
-- Policy da entidade A: aprovador local com concessão explícita (sequência 1).
insert into pol_ids select 'entity_a_v1', public.fin_save_policy_draft('00000000-0000-4000-8000-0000000c7101', '00000000-0000-4000-8000-0000000c7201', 'Alçada local A', $j${
  "rules": [{"id":"local","label":"Toda operação da A passa pelo aprovador local","when":[],
             "stages":[{"key":"local","label":"Aprovação local","sequence":1,"roles":["finance_manager","analyst"],"scope":"entity","min_approvals":1,"due_hours":48}]}]
}$j$::jsonb, null);
select public.fin_activate_policy_version((select value from pol_ids where key='entity_a_v1'));
insert into pol_ids select 'group_policy', policy_id from public.fin_policy_versions where id=(select value from pol_ids where key='group_v1');
insert into pol_ids select 'entity_a_policy', policy_id from public.fin_policy_versions where id=(select value from pol_ids where key='entity_a_v1');

-- 3. Versão ativada é imutável (nem o dono do banco reescreve).
reset role;
select pg_temp.expect_error(format($q$update public.fin_policy_versions set document='{"rules":[]}'::jsonb where id='%s'$q$, (select value from pol_ids where key='group_v1')), 'immutable record');
select pg_temp.expect_error(format($q$delete from public.fin_policy_versions where id='%s'$q$, (select value from pol_ids where key='group_v1')), 'immutable record');
select pg_temp.expect_error(format($q$update public.fin_policy_versions set status='draft', activated_at=null, activated_by=null where id='%s'$q$, (select value from pol_ids where key='group_v1')), 'immutable record');
set role authenticated;

-- 4. Precedência e fatos.
select pg_temp.as_user('01');
do $$
declare v jsonb;
begin
  -- R1 (A, BRL 2 mi, 1 proposta): local (seq 1) -> tesouraria (seq 2) + bloqueio de competição.
  v := public.fin_preview_approval_policy('00000000-0000-4000-8000-0000000c7401', '00000000-0000-4000-8000-0000000c7601', '{}'::jsonb);
  if v->>'engine' <> 'policy' or jsonb_array_length(v->'policies') <> 2 then raise exception 'policies aplicáveis: %', v->'policies'; end if;
  if jsonb_path_query_array(v->'stages', '$[*].key') <> '["entity.local","group.group_treasury"]'::jsonb then raise exception 'plano: %', v->'stages'; end if;
  if jsonb_path_query_array(v->'stages', '$[*].sequence') <> '[1,2]'::jsonb then raise exception 'ordem: %', v->'stages'; end if;
  if jsonb_array_length(v->'blockers') <> 1 or v->'blockers'->0->>'rule_id' <> 'competition' then raise exception 'bloqueio: %', v->'blockers'; end if;
  if (v->'facts'->>'provider_new')::boolean is not true or (v->'facts'->>'amount')::numeric <> 2000000 or v->'facts'->>'currency' <> 'BRL' then raise exception 'fatos: %', v->'facts'; end if;
  if (v->'sod'->>'requester_cannot_decide')::boolean is not true or (v->'sod'->>'decider_not_sole_final_approver')::boolean is not true then raise exception 'SoD: %', v->'sod'; end if;
  -- R4 (unidade de A): a policy da entidade mãe vale (fallback de escopo).
  v := public.fin_preview_approval_policy('00000000-0000-4000-8000-0000000c7404', '00000000-0000-4000-8000-0000000c7605', '{}'::jsonb);
  if jsonb_path_query_array(v->'stages', '$[*].key') <> '["entity.local"]'::jsonb or jsonb_array_length(v->'blockers') <> 0 then raise exception 'unidade: %', v; end if;
  -- R3 (C, USD 5 mi): regra em BRL não converte moeda; casa por conservadorismo e diz por quê.
  v := public.fin_preview_approval_policy('00000000-0000-4000-8000-0000000c7403', '00000000-0000-4000-8000-0000000c7603', '{}'::jsonb);
  if jsonb_path_query_array(v->'stages', '$[*].key') <> '["group.group_treasury"]'::jsonb then raise exception 'moeda: %', v->'stages'; end if;
  if not (v->'unknown_facts') ? 'amount_currency' or not exists (select 1 from jsonb_array_elements(v->'matched') m where m->>'rule_id'='above_1m' and (m->>'conservative')::boolean) then
    raise exception 'moeda sem explicação: %', v;
  end if;
  -- Fronteira do valor: >= é inclusivo; R$ 999.999,99 não casa.
  v := public.fin_simulate_policy_version((select value from pol_ids where key='group_v1'), '{"product":"credit","currency":"BRL","amount":1000000,"proposals_count":3}');
  if jsonb_array_length(v->'stages') <> 1 or (v->>'simulation')::boolean is not true then raise exception 'fronteira inclusiva: %', v; end if;
  v := public.fin_simulate_policy_version((select value from pol_ids where key='group_v1'), '{"product":"credit","currency":"BRL","amount":999999.99,"proposals_count":3}');
  if jsonb_array_length(v->'stages') <> 0 or jsonb_array_length(v->'blockers') <> 0 then raise exception 'fronteira exclusiva: %', v; end if;
  v := public.fin_simulate_policy_version((select value from pol_ids where key='group_v1'), '{"product":"credit","currency":"BRL","proposals_count":3}');
  if jsonb_array_length(v->'stages') <> 1 or not (v->'unknown_facts') ? 'amount' then raise exception 'valor desconhecido não foi conservador: %', v; end if;
end $$;

-- 5. Visibilidade: escopo restrito não vê policy da outra entidade; outro
--    tenant e provedor não veem nada nem conseguem prever.
select pg_temp.as_user('06');
do $$ begin
  if exists (select 1 from public.fin_policies where legal_entity_id='00000000-0000-4000-8000-0000000c7201') then raise exception 'B vê policy de A'; end if;
  if not exists (select 1 from public.fin_policies where legal_entity_id is null) then raise exception 'B não vê policy do grupo'; end if;
end $$;
select pg_temp.expect_error($q$select public.fin_preview_approval_policy('00000000-0000-4000-8000-0000000c7401',null,'{}'::jsonb)$q$, 'rfq not found');
select pg_temp.as_user('08');
select pg_temp.expect_error($q$select public.fin_preview_approval_policy('00000000-0000-4000-8000-0000000c7401',null,'{}'::jsonb)$q$, 'rfq not found');
do $$ begin if exists (select 1 from public.fin_policies) or exists (select 1 from public.fin_policy_flags) then raise exception 'outro tenant vê policy'; end if; end $$;
select pg_temp.as_user('09');
select pg_temp.expect_error($q$select public.fin_preview_approval_policy('00000000-0000-4000-8000-0000000c7401',null,'{}'::jsonb)$q$, 'rfq not found');
do $$ begin if exists (select 1 from public.fin_policies) or exists (select 1 from public.fin_policy_versions) then raise exception 'provedor vê policy'; end if; end $$;

-- 6. Pedido: o caminho v1 não pula a policy; indicações são conferidas.
select pg_temp.as_user('03');
select pg_temp.expect_error($q$select public.fin_request_approval('00000000-0000-4000-8000-0000000c7401','00000000-0000-4000-8000-0000000c7601',array['00000000-0000-4000-8000-0000000c7004'::uuid],'v1')$q$, 'policy assignment required');
-- grupo-only indicado para etapa local (exige concessão de entidade)
select pg_temp.expect_error($q$select public.fin_request_policy_approval('00000000-0000-4000-8000-0000000c7401','00000000-0000-4000-8000-0000000c7601','{"entity.local":["00000000-0000-4000-8000-0000000c7002"],"group.group_treasury":["00000000-0000-4000-8000-0000000c7010"]}','Pedido')$q$, 'policy approver ineligible');
-- usuário só de B (outra entidade) na tesouraria do grupo
select pg_temp.expect_error($q$select public.fin_request_policy_approval('00000000-0000-4000-8000-0000000c7401','00000000-0000-4000-8000-0000000c7601','{"entity.local":["00000000-0000-4000-8000-0000000c7004"],"group.group_treasury":["00000000-0000-4000-8000-0000000c7006"]}','Pedido')$q$, 'policy approver ineligible');
-- quem pede não aprova; ninguém ocupa duas etapas
select pg_temp.expect_error($q$select public.fin_request_policy_approval('00000000-0000-4000-8000-0000000c7401','00000000-0000-4000-8000-0000000c7601','{"entity.local":["00000000-0000-4000-8000-0000000c7003"],"group.group_treasury":["00000000-0000-4000-8000-0000000c7002"]}','Pedido')$q$, 'invalid approver');
select pg_temp.expect_error($q$select public.fin_request_policy_approval('00000000-0000-4000-8000-0000000c7401','00000000-0000-4000-8000-0000000c7601','{"entity.local":["00000000-0000-4000-8000-0000000c7004"],"group.group_treasury":["00000000-0000-4000-8000-0000000c7004"]}','Pedido')$q$, 'duplicate approver');
-- provedor e outro tenant não aprovam operação da compradora
select pg_temp.expect_error($q$select public.fin_request_policy_approval('00000000-0000-4000-8000-0000000c7401','00000000-0000-4000-8000-0000000c7601','{"entity.local":["00000000-0000-4000-8000-0000000c7004"],"group.group_treasury":["00000000-0000-4000-8000-0000000c7009"]}','Pedido')$q$, 'policy approver ineligible');
select pg_temp.expect_error($q$select public.fin_request_policy_approval('00000000-0000-4000-8000-0000000c7401','00000000-0000-4000-8000-0000000c7601','{"entity.local":["00000000-0000-4000-8000-0000000c7004"],"group.group_treasury":["00000000-0000-4000-8000-0000000c7008"]}','Pedido')$q$, 'policy approver ineligible');
-- etapa sem indicação / etapa inventada
select pg_temp.expect_error($q$select public.fin_request_policy_approval('00000000-0000-4000-8000-0000000c7401','00000000-0000-4000-8000-0000000c7601','{"entity.local":["00000000-0000-4000-8000-0000000c7004"]}','Pedido')$q$, 'policy approvers required');
select pg_temp.expect_error($q$select public.fin_request_policy_approval('00000000-0000-4000-8000-0000000c7401','00000000-0000-4000-8000-0000000c7601','{"entity.local":["00000000-0000-4000-8000-0000000c7004"],"group.group_treasury":["00000000-0000-4000-8000-0000000c7002"],"group.extra":["00000000-0000-4000-8000-0000000c7010"]}','Pedido')$q$, 'invalid approval request');
-- usuário só de B não pede aprovação de processo de A
select pg_temp.as_user('06');
select pg_temp.expect_error($q$select public.fin_request_policy_approval('00000000-0000-4000-8000-0000000c7401','00000000-0000-4000-8000-0000000c7601','{"entity.local":["00000000-0000-4000-8000-0000000c7004"],"group.group_treasury":["00000000-0000-4000-8000-0000000c7002"]}','Pedido')$q$, 'forbidden');
select pg_temp.as_user('03');
insert into pol_ids select 'req1', public.fin_request_policy_approval('00000000-0000-4000-8000-0000000c7401','00000000-0000-4000-8000-0000000c7601',
  '{"entity.local":["00000000-0000-4000-8000-0000000c7004"],"group.group_treasury":["00000000-0000-4000-8000-0000000c7002"]}','Aprovação da operação R1');
do $$
declare r public.fin_approval_requests%rowtype;
begin
  select * into r from public.fin_approval_requests where id=(select value from pol_ids where key='req1');
  if r.policy_snapshot is null or r.evaluated_at is null or r.expires_at is null or cardinality(r.policy_version_ids) <> 2 then raise exception 'snapshot incompleto'; end if;
  if (select string_agg(stage_key||':'||status, ',' order by sequence) from public.fin_approval_stages where request_id=r.id) <> 'entity.local:active,group.group_treasury:pending' then
    raise exception 'etapas iniciais erradas';
  end if;
end $$;
-- Só o aprovador local foi avisado (a tesouraria entra na sequência 2).
reset role;
do $$ begin
  if not exists (select 1 from public.fin_notifications where user_id='00000000-0000-4000-8000-0000000c7004' and event_type='approval_requested')
     or exists (select 1 from public.fin_notifications where user_id='00000000-0000-4000-8000-0000000c7002' and event_type='approval_requested') then
    raise exception 'aviso de aprovação fora de ordem';
  end if;
end $$;
set role authenticated;

-- 7. Entidade restrita (B) não vê etapas nem exceções do pedido de A.
select pg_temp.as_user('06');
do $$ begin
  if exists (select 1 from public.fin_approval_stages where request_id=(select value from pol_ids where key='req1'))
     or exists (select 1 from public.fin_approval_requests where id=(select value from pol_ids where key='req1')) then raise exception 'B vê aprovação de A'; end if;
end $$;
select pg_temp.expect_error(format($q$select public.fin_act_on_approval_v2('%s','approved',null,null)$q$, (select value from pol_ids where key='req1')), 'forbidden');
-- Tesouraria ainda não está na vez; quem pediu nunca vota.
select pg_temp.as_user('02');
select pg_temp.expect_error(format($q$select public.fin_act_on_approval_v2('%s','approved',null,null)$q$, (select value from pol_ids where key='req1')), 'forbidden');
select pg_temp.as_user('03');
select pg_temp.expect_error(format($q$select public.fin_act_on_approval_v2('%s','approved',null,null)$q$, (select value from pol_ids where key='req1')), 'forbidden');

-- 8. Nova versão da policy no meio do processo: o pedido segue a v1 gravada.
select pg_temp.as_user('01');
insert into pol_ids select 'group_v2', public.fin_save_policy_draft('00000000-0000-4000-8000-0000000c7101', null, 'Alçadas do grupo', $j${
  "rules": [
    {"id":"above_5m","label":"Acima de R$ 5 milhões exige dois da tesouraria",
     "when":[{"fact":"amount","op":"gte","value":5000000,"currency":"BRL"}],
     "stages":[{"key":"group_treasury","label":"Tesouraria do grupo","sequence":2,"roles":["admin","finance_manager"],"scope":"group","min_approvals":2}]}
  ],
  "fallback":{"stages":[{"key":"controller","label":"Controladoria","sequence":3,"roles":["admin"],"scope":"group","min_approvals":1}]}
}$j$::jsonb, 'Sobe o limite');
select public.fin_activate_policy_version((select value from pol_ids where key='group_v2'));
do $$
declare v jsonb; s jsonb;
begin
  if (select status from public.fin_policy_versions where id=(select value from pol_ids where key='group_v1')) <> 'superseded' then raise exception 'v1 não foi substituída'; end if;
  select policy_snapshot into s from public.fin_approval_requests where id=(select value from pol_ids where key='req1');
  if not exists (select 1 from public.fin_approval_requests where id=(select value from pol_ids where key='req1')
                  and (select value from pol_ids where key='group_v1') = any(policy_version_ids))
     or s->'policies' @> jsonb_build_array(jsonb_build_object('version_id', (select value from pol_ids where key='group_v2'))) then
    raise exception 'pedido mudou de versão silenciosamente';
  end if;
  if (select count(*) from public.fin_approval_stages where request_id=(select value from pol_ids where key='req1')) <> 2 then raise exception 'etapas reescritas'; end if;
  -- A prévia (processo novo) já usa a v2: R1 abaixo de 5 mi cai no fallback do grupo.
  v := public.fin_preview_approval_policy('00000000-0000-4000-8000-0000000c7401', '00000000-0000-4000-8000-0000000c7601', '{}'::jsonb);
  if jsonb_path_query_array(v->'stages', '$[*].key') <> '["entity.local","group.controller"]'::jsonb then raise exception 'prévia v2: %', v->'stages'; end if;
  if not exists (select 1 from jsonb_array_elements(v->'matched') m where m->>'rule_id'='__fallback' and (m->>'fallback')::boolean) then raise exception 'fallback não registrado'; end if;
end $$;
reset role;
select pg_temp.expect_error(format($q$update public.fin_approval_requests set policy_snapshot='{}'::jsonb where id='%s'$q$, (select value from pol_ids where key='req1')), 'immutable record');
select pg_temp.expect_error(format($q$update public.fin_approval_stages set min_approvals=5 where request_id='%s'$q$, (select value from pol_ids where key='req1')), 'immutable record');
set role authenticated;

-- 9. Aprovador local aprova; a sequência 2 abre e a tesouraria é avisada.
select pg_temp.as_user('04');
select pg_temp.expect_error(format($q$select public.fin_act_on_approval_v2('%s','rejected','',null)$q$, (select value from pol_ids where key='req1')), 'approval comment required');
do $$ begin
  if public.fin_act_on_approval_v2((select value from pol_ids where key='req1'),'approved',null,null) <> 'pending' then raise exception 'pedido concluiu cedo'; end if;
  if (select string_agg(stage_key||':'||status, ',' order by sequence) from public.fin_approval_stages where request_id=(select value from pol_ids where key='req1')) <> 'entity.local:approved,group.group_treasury:active' then
    raise exception 'sequência 2 não abriu';
  end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from public.fin_notifications where user_id='00000000-0000-4000-8000-0000000c7002' and event_type='approval_requested') then raise exception 'tesouraria não avisada'; end if;
end $$;
set role authenticated;

-- 10. Aprovador revogado: a tesouraria perde o escopo de grupo e não vota mais.
select pg_temp.as_user('01');
select public.fin_set_member_entity_scope('00000000-0000-4000-8000-0000000c7101','00000000-0000-4000-8000-0000000c7002','entities',array['00000000-0000-4000-8000-0000000c7201'::uuid]);
select pg_temp.as_user('02');
select pg_temp.expect_error(format($q$select public.fin_act_on_approval_v2('%s','approved',null,null)$q$, (select value from pol_ids where key='req1')), 'approver no longer eligible');
select pg_temp.as_user('01');
select public.fin_set_member_entity_scope('00000000-0000-4000-8000-0000000c7101','00000000-0000-4000-8000-0000000c7002','group',array[]::uuid[]);

-- 11. Delegação: substituto sem o papel da etapa não vota; substituto elegível
--     vota em nome do titular e a trilha guarda os dois.
select pg_temp.as_user('02');
select pg_temp.expect_error($q$select public.fin_set_approval_delegation('00000000-0000-4000-8000-0000000c7101','00000000-0000-4000-8000-0000000c7002',now(),now()+interval '1 day','Férias')$q$, 'invalid delegation');
select pg_temp.expect_error($q$select public.fin_set_approval_delegation('00000000-0000-4000-8000-0000000c7101','00000000-0000-4000-8000-0000000c7007',now(),now()+interval '120 days','Férias')$q$, 'invalid delegation');
insert into pol_ids select 'delegation_viewer', public.fin_set_approval_delegation('00000000-0000-4000-8000-0000000c7101','00000000-0000-4000-8000-0000000c7007',now()-interval '1 minute',now()+interval '7 days','Férias');
select pg_temp.as_user('07');
select pg_temp.expect_error(format($q$select public.fin_act_on_approval_v2('%s','approved',null,null)$q$, (select value from pol_ids where key='req1')), 'approver no longer eligible');
select pg_temp.as_user('02');
select public.fin_revoke_approval_delegation((select value from pol_ids where key='delegation_viewer'));
insert into pol_ids select 'delegation_admin', public.fin_set_approval_delegation('00000000-0000-4000-8000-0000000c7101','00000000-0000-4000-8000-0000000c7010',now()-interval '1 minute',now()+interval '7 days','Viagem');
select pg_temp.as_user('07');
select pg_temp.expect_error(format($q$select public.fin_act_on_approval_v2('%s','approved',null,null)$q$, (select value from pol_ids where key='req1')), 'forbidden');
select pg_temp.as_user('10');
do $$ begin
  -- Etapas concluídas, mas o bloqueio de competição (1 de 2 propostas) segura o pedido.
  if public.fin_act_on_approval_v2((select value from pol_ids where key='req1'),'approved',null,null) <> 'pending' then raise exception 'bloqueio ignorado'; end if;
  if not exists (select 1 from public.fin_approval_steps where request_id=(select value from pol_ids where key='req1')
                  and approver_id='00000000-0000-4000-8000-0000000c7002' and acted_by='00000000-0000-4000-8000-0000000c7010'
                  and delegation_id=(select value from pol_ids where key='delegation_admin') and status='approved') then
    raise exception 'voto delegado sem trilha';
  end if;
end $$;
select pg_temp.as_user('03');
select pg_temp.expect_error($q$select public.fin_record_decision('00000000-0000-4000-8000-0000000c7401','00000000-0000-4000-8000-0000000c7601','{}'::jsonb,'Decisão')$q$, 'approval required or stale');

-- 12. Exceção explícita: quem pede não decide; papel errado não decide; admin decide.
select pg_temp.expect_error(format($q$select public.fin_request_policy_exception('%s','%s','not_matched','urgent_operation','Operação urgente do trimestre','[]'::jsonb)$q$,
  (select value from pol_ids where key='req1'), (select value from pol_ids where key='group_v1')), 'invalid policy exception');
select pg_temp.expect_error(format($q$select public.fin_request_policy_exception('%s','%s','competition','urgent_operation','curto','[]'::jsonb)$q$,
  (select value from pol_ids where key='req1'), (select value from pol_ids where key='group_v1')), 'invalid policy exception');
insert into pol_ids select 'exception1', public.fin_request_policy_exception((select value from pol_ids where key='req1'), (select value from pol_ids where key='group_v1'),
  'competition', 'market_constraint', 'Só um banco atende garantia de recebíveis neste prazo', '[{"label":"Ata do comitê","reference":"Comitê de crédito 2026-09"}]'::jsonb);
select pg_temp.expect_error(format($q$select public.fin_request_policy_exception('%s','%s','competition','urgent_operation','Pedido duplicado da mesma regra','[]'::jsonb)$q$,
  (select value from pol_ids where key='req1'), (select value from pol_ids where key='group_v1')), 'policy exception already open');
select pg_temp.expect_error(format($q$select public.fin_decide_policy_exception('%s','approved','Eu mesmo aprovo')$q$, (select value from pol_ids where key='exception1')), 'segregation of duties');
select pg_temp.as_user('04');
select pg_temp.expect_error(format($q$select public.fin_decide_policy_exception('%s','approved','Aprovo')$q$, (select value from pol_ids where key='exception1')), 'forbidden');
select pg_temp.as_user('01');
do $$ begin
  if public.fin_decide_policy_exception((select value from pol_ids where key='exception1'),'approved','Exceção aceita pelo comitê') <> 'approved' then raise exception 'exceção não liberou o pedido'; end if;
  if (select status from public.fin_policy_exceptions where id=(select value from pol_ids where key='exception1')) <> 'approved'
     or (select decided_by from public.fin_policy_exceptions where id=(select value from pol_ids where key='exception1')) <> '00000000-0000-4000-8000-0000000c7001' then
    raise exception 'exceção sem trilha';
  end if;
end $$;

-- 13. Decisão e SoD: quem pediu não decide (policy); único aprovador final não decide.
select pg_temp.as_user('03');
select pg_temp.expect_error($q$select public.fin_record_decision('00000000-0000-4000-8000-0000000c7401','00000000-0000-4000-8000-0000000c7601','{}'::jsonb,'Decisão')$q$, 'segregation of duties');
select pg_temp.as_user('10');
select pg_temp.expect_error($q$select public.fin_record_decision('00000000-0000-4000-8000-0000000c7401','00000000-0000-4000-8000-0000000c7601','{}'::jsonb,'Decisão')$q$, 'segregation of duties');
select pg_temp.as_user('02');
insert into pol_ids select 'decision1', public.fin_record_decision('00000000-0000-4000-8000-0000000c7401','00000000-0000-4000-8000-0000000c7601','{}'::jsonb,'Decisão da tesouraria');
do $$ begin
  if not exists (select 1 from public.fin_decisions where id=(select value from pol_ids where key='decision1')
                  and (snapshot->'policy'->>'from_request')::boolean and jsonb_array_length(snapshot->'policy'->'policies') = 2) then
    raise exception 'decisão sem a policy do pedido';
  end if;
end $$;

-- 14. Plano só com bloqueio (R2 em B): pedido sem etapas; exceção rejeitada não libera.
select pg_temp.as_user('01');
select public.fin_activate_policy_version(public.fin_save_policy_draft('00000000-0000-4000-8000-0000000c7101', null, 'Alçadas do grupo', $j${
  "rules": [{"id":"competition","label":"Crédito exige ao menos duas propostas","when":[{"fact":"product","op":"in","value":["credit"]}],"requirements":{"min_proposals":2,"justification":true}}],
  "expire_after_hours":72
}$j$::jsonb, 'Só competição'));
select pg_temp.as_user('06');
select pg_temp.expect_error($q$select public.fin_request_policy_approval('00000000-0000-4000-8000-0000000c7402','00000000-0000-4000-8000-0000000c7602','{}'::jsonb,'Pedido R2',null)$q$, 'policy justification required');
select pg_temp.expect_error($q$select public.fin_record_decision('00000000-0000-4000-8000-0000000c7402','00000000-0000-4000-8000-0000000c7602','{}'::jsonb,'Decisão')$q$, 'approval required or stale');
insert into pol_ids select 'req2', public.fin_request_policy_approval('00000000-0000-4000-8000-0000000c7402','00000000-0000-4000-8000-0000000c7602','{}'::jsonb,'Pedido R2','Banco único com relacionamento no prazo');
insert into pol_ids select 'exception2', public.fin_request_policy_exception((select value from pol_ids where key='req2'),
  (select policy_version_ids[1] from public.fin_approval_requests where id=(select value from pol_ids where key='req2')), 'competition', 'urgent_operation', 'Prazo do capital de giro vence esta semana', '[]'::jsonb);
select pg_temp.as_user('10');
select public.fin_decide_policy_exception((select value from pol_ids where key='exception2'),'rejected','Buscar ao menos mais um banco');
do $$ begin
  if (select status from public.fin_approval_requests where id=(select value from pol_ids where key='req2')) <> 'pending' then raise exception 'exceção rejeitada liberou'; end if;
end $$;
select pg_temp.as_user('06');
insert into pol_ids select 'exception3', public.fin_request_policy_exception((select value from pol_ids where key='req2'),
  (select policy_version_ids[1] from public.fin_approval_requests where id=(select value from pol_ids where key='req2')), 'competition', 'other', 'Segunda tentativa com novo argumento', '[]'::jsonb);
select public.fin_cancel_policy_exception((select value from pol_ids where key='exception3'));
select public.fin_cancel_approval((select value from pol_ids where key='req2'));
do $$ begin
  if (select status from public.fin_approval_requests where id=(select value from pol_ids where key='req2')) <> 'cancelled'
     or (select status from public.fin_policy_exceptions where id=(select value from pol_ids where key='exception3')) <> 'cancelled' then raise exception 'cancelamento incompleto'; end if;
end $$;

-- 15. Devolução com motivo, substituição explícita, expiração e escalação (R3).
select pg_temp.as_user('01');
select public.fin_activate_policy_version(public.fin_save_policy_draft('00000000-0000-4000-8000-0000000c7101', null, 'Alçadas do grupo', $j${
  "rules": [{"id":"treasury","label":"Toda operação passa pela tesouraria","when":[],
             "stages":[{"key":"group_treasury","label":"Tesouraria do grupo","sequence":1,"roles":["finance_manager"],"scope":"group","min_approvals":1,"due_hours":4}]}],
  "escalation_roles":["admin"], "expire_after_hours":48
}$j$::jsonb, 'Tesouraria sempre'));
insert into pol_ids select 'req3', public.fin_request_policy_approval('00000000-0000-4000-8000-0000000c7403','00000000-0000-4000-8000-0000000c7603',
  '{"group.group_treasury":["00000000-0000-4000-8000-0000000c7002"]}','Pedido R3');
select pg_temp.as_user('02');
select pg_temp.expect_error(format($q$select public.fin_act_on_approval_v2('%s','changes_requested','Revisar garantia','made_up')$q$, (select value from pol_ids where key='req3')), 'invalid approval action');
do $$ begin
  if public.fin_act_on_approval_v2((select value from pol_ids where key='req3'),'changes_requested','Revisar a garantia exigida','risk_review') <> 'changes_requested' then raise exception 'devolução'; end if;
  if (select reason_code from public.fin_approval_steps where request_id=(select value from pol_ids where key='req3') and status='changes_requested') <> 'risk_review' then raise exception 'motivo não gravado'; end if;
end $$;
select pg_temp.as_user('01');
insert into pol_ids select 'req3b', public.fin_request_policy_approval('00000000-0000-4000-8000-0000000c7403','00000000-0000-4000-8000-0000000c7603',
  '{"group.group_treasury":["00000000-0000-4000-8000-0000000c7002"]}','Pedido R3 revisto');
select public.fin_supersede_approval((select value from pol_ids where key='req3b'), 'Reavaliar sob a policy nova');
do $$ begin
  if (select status from public.fin_approval_requests where id=(select value from pol_ids where key='req3b')) <> 'superseded'
     or exists (select 1 from public.fin_approval_steps where request_id=(select value from pol_ids where key='req3b') and status='pending') then raise exception 'substituição'; end if;
end $$;
insert into pol_ids select 'req3c', public.fin_request_policy_approval('00000000-0000-4000-8000-0000000c7403','00000000-0000-4000-8000-0000000c7603',
  '{"group.group_treasury":["00000000-0000-4000-8000-0000000c7002"]}','Pedido R3 para prazo');
-- Prazo da etapa vencido: escalação uma única vez.
reset role;
update public.fin_approval_stages set due_at = now() - interval '1 hour' where request_id=(select value from pol_ids where key='req3c');
select set_config('request.jwt.claim.sub','',false);
set role service_role;
do $$ begin
  if public.fin_run_approval_deadlines() < 1 then raise exception 'escalação não processada'; end if;
  if public.fin_run_approval_deadlines() <> 0 then raise exception 'escalação não é idempotente'; end if;
end $$;
reset role;
do $$ begin
  if (select escalated_at from public.fin_approval_stages where request_id=(select value from pol_ids where key='req3c')) is null
     or (select status from public.fin_approval_requests where id=(select value from pol_ids where key='req3c')) <> 'pending' then raise exception 'escalação aprovou ou não marcou'; end if;
  if not exists (select 1 from public.fin_notifications n join public.fin_tasks t on t.id=n.event_id
                  where n.user_id in ('00000000-0000-4000-8000-0000000c7010') and n.title='Aprovação em atraso') then raise exception 'escalação sem aviso'; end if;
end $$;
-- Janela do pedido vencida: expira, não aprova.
set session_replication_role = replica;
update public.fin_approval_requests set expires_at = now() - interval '1 minute' where id=(select value from pol_ids where key='req3c');
set session_replication_role = origin;
set role service_role;
do $$ begin perform public.fin_run_approval_deadlines(); end $$;
reset role;
do $$ begin
  if (select status from public.fin_approval_requests where id=(select value from pol_ids where key='req3c')) <> 'expired'
     or exists (select 1 from public.fin_approval_stages where request_id=(select value from pol_ids where key='req3c') and status not in ('expired')) then raise exception 'expiração'; end if;
end $$;
set role authenticated;
select pg_temp.as_user('02');
select pg_temp.expect_error(format($q$select public.fin_act_on_approval_v2('%s','approved',null,null)$q$, (select value from pol_ids where key='req3c')), 'approval not pending');
-- Outro tenant não aciona prazos nem age em pedidos alheios.
select pg_temp.as_user('08');
select pg_temp.expect_error($q$select public.fin_process_approval_deadlines('00000000-0000-4000-8000-0000000c7101')$q$, 'forbidden');
select pg_temp.expect_error(format($q$select public.fin_act_on_approval_v2('%s','approved',null,null)$q$, (select value from pol_ids where key='req3')), 'forbidden');
select pg_temp.expect_error(format($q$select public.fin_decide_policy_exception('%s','approved','Aprovo')$q$, (select value from pol_ids where key='exception2')), 'forbidden');
-- Provedor tampouco.
select pg_temp.as_user('09');
select pg_temp.expect_error(format($q$select public.fin_act_on_approval_v2('%s','approved',null,null)$q$, (select value from pol_ids where key='req3')), 'forbidden');
do $$ begin if exists (select 1 from public.fin_approval_stages) or exists (select 1 from public.fin_policy_exceptions) then raise exception 'provedor vê aprovação'; end if; end $$;

-- 16. Aposentar policy de entidade: só a do grupo vale para processos novos.
select pg_temp.as_user('01');
select public.fin_retire_policy((select value from pol_ids where key='entity_a_policy'));
do $$ declare v jsonb; begin
  v := public.fin_preview_approval_policy('00000000-0000-4000-8000-0000000c7404', '00000000-0000-4000-8000-0000000c7605', '{}'::jsonb);
  if jsonb_path_query_array(v->'stages', '$[*].key') <> '["group.group_treasury"]'::jsonb then raise exception 'policy aposentada ainda vale: %', v->'stages'; end if;
end $$;
-- Rascunho pode ser descartado; versão ativa não.
insert into pol_ids select 'draft_x', public.fin_save_policy_draft('00000000-0000-4000-8000-0000000c7101', null, 'Alçadas do grupo', '{"rules":[{"id":"justify","label":"Justificar","requirements":{"justification":true}}]}'::jsonb, null);
select public.fin_discard_policy_draft((select value from pol_ids where key='draft_x'));
select pg_temp.expect_error(format($q$select public.fin_discard_policy_draft('%s')$q$, (select value from pol_ids where key='group_v2')), 'policy version not draft');
-- Sinalizadores do cliente: só admin; declarados entram nos fatos.
select public.fin_set_policy_flag('00000000-0000-4000-8000-0000000c7101','sanctions_review','Revisão de sanções','compliance',true);
do $$ declare v jsonb; begin
  v := public.fin_preview_approval_policy('00000000-0000-4000-8000-0000000c7404', null, '{"flags":["sanctions_review","unknown_flag"],"covenant_present":true}'::jsonb);
  if v->'facts'->'flags' <> '["sanctions_review"]'::jsonb or (v->'facts'->>'covenant_present')::boolean is not true then raise exception 'fatos declarados: %', v->'facts'; end if;
end $$;
select pg_temp.as_user('04');
select pg_temp.expect_error($q$select public.fin_set_policy_flag('00000000-0000-4000-8000-0000000c7101','x_flag','Outro','risk',true)$q$, 'forbidden');

reset role;
select set_config('request.jwt.claim.sub','',false);
do $$ begin
  if (select count(*) from public.fin_events where event_type in ('policy_activated','policy_retired','approval_delegation_created','policy_exception_requested','policy_exception_approved',
       'policy_exception_rejected','approval_superseded','approval_expired','approval_stage_escalated','approval_completed')
       and organization_id='00000000-0000-4000-8000-0000000c7101') < 10 then
    raise exception 'trilha de policy incompleta';
  end if;
end $$;

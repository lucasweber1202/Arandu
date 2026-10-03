\set ON_ERROR_STOP on
-- Relationship & Portfolio (docs/supabase-financial-relationships-portfolio.sql):
-- contatos, relação por entidade, issues, scorecard do cliente versionado com
-- avaliação imutável, facilities com histórico, saldos point-in-time,
-- cronograma versionado, garantias; escopo de entidade, outro tenant e provedor.
insert into auth.users(id,email) values
('00000000-0000-4000-8000-0000000aa001','rp-admin@example.invalid'),
('00000000-0000-4000-8000-0000000aa002','rp-analyst-a@example.invalid'),
('00000000-0000-4000-8000-0000000aa003','rp-viewer@example.invalid'),
('00000000-0000-4000-8000-0000000aa004','rp-other@example.invalid'),
('00000000-0000-4000-8000-0000000aa005','rp-provider@example.invalid')
on conflict(id) do nothing;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-0000000ab001','Grupo portfólio DEMO','BUYER','00000000-0000-4000-8000-0000000aa001'),
('00000000-0000-4000-8000-0000000ab002','Outra empresa portfólio DEMO','BUYER','00000000-0000-4000-8000-0000000aa004'),
('00000000-0000-4000-8000-0000000ab003','Banco portfólio DEMO','PROVIDER','00000000-0000-4000-8000-0000000aa005');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-0000000ab001','00000000-0000-4000-8000-0000000aa001','admin'),
('00000000-0000-4000-8000-0000000ab001','00000000-0000-4000-8000-0000000aa002','analyst'),
('00000000-0000-4000-8000-0000000ab001','00000000-0000-4000-8000-0000000aa003','viewer'),
('00000000-0000-4000-8000-0000000ab002','00000000-0000-4000-8000-0000000aa004','admin'),
('00000000-0000-4000-8000-0000000ab003','00000000-0000-4000-8000-0000000aa005','provider_user');
insert into public.fin_providers(id,organization_id,name,kind,created_by,provider_organization_id) values
('00000000-0000-4000-8000-0000000ab010','00000000-0000-4000-8000-0000000ab001','Banco Relação DEMO','bank','00000000-0000-4000-8000-0000000aa001','00000000-0000-4000-8000-0000000ab003'),
('00000000-0000-4000-8000-0000000ab011','00000000-0000-4000-8000-0000000ab002','Banco alheio DEMO','bank','00000000-0000-4000-8000-0000000aa004',null);

create temporary table rp_ids(key text primary key, value uuid);
grant all on rp_ids to authenticated;
create or replace function pg_temp.expect_error(p_sql text, p_message text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'esperava falha "%" em: %', p_message, p_sql;
exception when others then
  if sqlerrm not like p_message || '%' then raise exception 'falha inesperada em %: % (esperava %)', p_sql, sqlerrm, p_message; end if;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated;

do $$ begin
  if has_table_privilege('authenticated','public.fin_facilities','INSERT') or has_table_privilege('authenticated','public.fin_facilities','UPDATE')
     or has_table_privilege('authenticated','public.fin_facility_balances','INSERT') or has_table_privilege('authenticated','public.fin_provider_reviews','INSERT')
     or has_table_privilege('authenticated','public.fin_guarantees','INSERT') or has_table_privilege('anon','public.fin_provider_contacts','SELECT') then
    raise exception 'escrita direta no portfólio exposta';
  end if;
  if has_function_privilege('authenticated','public.fin_assert_portfolio_write(uuid,uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.fin_facility_history_trigger()','EXECUTE') then raise exception 'auxiliar interna exposta'; end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000aa001',false);
insert into rp_ids select 'A', public.fin_create_legal_entity('00000000-0000-4000-8000-0000000ab001','legal_entity','Portfólio A DEMO','A',null,'BR','BRL',null);
insert into rp_ids select 'B', public.fin_create_legal_entity('00000000-0000-4000-8000-0000000ab001','legal_entity','Portfólio B DEMO','B',null,'US','USD',null);
select public.fin_set_member_entity_scope('00000000-0000-4000-8000-0000000ab001','00000000-0000-4000-8000-0000000aa002','entities',array[(select value from rp_ids where key='A')]);

-- 1. Relacionamento: contato de grupo e de entidade, relação, issue.
insert into rp_ids select 'contact_group', public.fin_add_provider_contact('00000000-0000-4000-8000-0000000ab001','00000000-0000-4000-8000-0000000ab010','Gerente de relacionamento','Corporate','gerente@banco.example','+55 11 4000-0000',null,true);
insert into rp_ids select 'contact_b', public.fin_add_provider_contact('00000000-0000-4000-8000-0000000ab001','00000000-0000-4000-8000-0000000ab010','Contato Miami','Trade',null,null,(select value from rp_ids where key='B'),false);
select pg_temp.expect_error($q$select public.fin_add_provider_contact('00000000-0000-4000-8000-0000000ab001','00000000-0000-4000-8000-0000000ab010','x@y.com',null,null,null,null,false)$q$, 'invalid contact');
select pg_temp.expect_error($q$select public.fin_add_provider_contact('00000000-0000-4000-8000-0000000ab001','00000000-0000-4000-8000-0000000ab011','Contato',null,null,null,null,false)$q$, 'provider not found');
insert into rp_ids select 'rel_a', public.fin_set_provider_relationship('00000000-0000-4000-8000-0000000ab001','00000000-0000-4000-8000-0000000ab010',(select value from rp_ids where key='A'),'active','00000000-0000-4000-8000-0000000aa002',array['credit','cash_management'],'2020-01-01','Banco principal da entidade A');
-- Mesmo par provedor × entidade atualiza a relação (sem duplicar).
select public.fin_set_provider_relationship('00000000-0000-4000-8000-0000000ab001','00000000-0000-4000-8000-0000000ab010',(select value from rp_ids where key='A'),'active','00000000-0000-4000-8000-0000000aa002',array['credit'],'2020-01-01',null);
insert into rp_ids select 'rel_b', public.fin_set_provider_relationship('00000000-0000-4000-8000-0000000ab001','00000000-0000-4000-8000-0000000ab010',(select value from rp_ids where key='B'),'prospect',null,'{}',null,null);
select pg_temp.expect_error($q$select public.fin_set_provider_relationship('00000000-0000-4000-8000-0000000ab001','00000000-0000-4000-8000-0000000ab010',(select value from rp_ids where key='A'),'active',null,array['crypto'],null,null)$q$, 'invalid relationship');
insert into rp_ids select 'issue_b', public.fin_open_provider_issue('00000000-0000-4000-8000-0000000ab001','00000000-0000-4000-8000-0000000ab010','Tarifa cobrada em duplicidade','billing','high',null,(select value from rp_ids where key='B'),null,current_date + 7,null);
select pg_temp.expect_error($q$select public.fin_update_provider_issue((select value from rp_ids where key='issue_b'),'resolved',null)$q$, 'resolution required');
select public.fin_update_provider_issue((select value from rp_ids where key='issue_b'),'resolved','Estorno confirmado pelo banco');
select pg_temp.expect_error($q$select public.fin_update_provider_issue((select value from rp_ids where key='issue_b'),'in_progress',null)$q$, 'issue closed');

-- 2. Scorecard do cliente: versão nova aposenta a anterior; avaliação imutável.
insert into rp_ids select 'tpl1', public.fin_create_scorecard_template('00000000-0000-4000-8000-0000000ab001','relacionamento','Relacionamento bancário',
  '[{"key":"atendimento","label":"Atendimento","weight":60,"scale_max":5},{"key":"prazo","label":"Prazo de resposta","weight":40,"scale_max":5}]'::jsonb);
select pg_temp.expect_error($q$select public.fin_create_scorecard_template('00000000-0000-4000-8000-0000000ab001','ruim','Peso zero','[{"key":"a","label":"A","weight":0,"scale_max":5}]'::jsonb)$q$, 'invalid scorecard');
select pg_temp.expect_error($q$select public.fin_create_scorecard_template('00000000-0000-4000-8000-0000000ab001','dup','Duplicado','[{"key":"aa","label":"A","weight":1,"scale_max":5},{"key":"aa","label":"B","weight":1,"scale_max":5}]'::jsonb)$q$, 'invalid scorecard');
-- Só um critério respondido: resultado = 80, peso respondido = 60%.
insert into rp_ids select 'review1', public.fin_record_provider_review('00000000-0000-4000-8000-0000000ab001','00000000-0000-4000-8000-0000000ab010',(select value from rp_ids where key='tpl1'),
  '2026-01-01','2026-06-30','{"atendimento":4}'::jsonb,null,'Semestre 1');
select pg_temp.expect_error($q$select public.fin_record_provider_review('00000000-0000-4000-8000-0000000ab001','00000000-0000-4000-8000-0000000ab010',(select value from rp_ids where key='tpl1'),'2026-01-01','2026-06-30','{"atendimento":6}'::jsonb,null,null)$q$, 'invalid review');
select pg_temp.expect_error($q$select public.fin_record_provider_review('00000000-0000-4000-8000-0000000ab001','00000000-0000-4000-8000-0000000ab010',(select value from rp_ids where key='tpl1'),'2026-01-01','2026-06-30','{"ranking_arandu":5}'::jsonb,null,null)$q$, 'invalid review');
insert into rp_ids select 'tpl2', public.fin_create_scorecard_template('00000000-0000-4000-8000-0000000ab001','relacionamento','Relacionamento bancário',
  '[{"key":"atendimento","label":"Atendimento","weight":50,"scale_max":10},{"key":"implantacao","label":"Implantação","weight":50,"scale_max":10}]'::jsonb);
select pg_temp.expect_error($q$select public.fin_record_provider_review('00000000-0000-4000-8000-0000000ab001','00000000-0000-4000-8000-0000000ab010',(select value from rp_ids where key='tpl1'),'2026-07-01','2026-12-31','{"atendimento":4}'::jsonb,null,null)$q$, 'invalid scorecard');
reset role;
do $$ begin
  if (select weighted_result||'/'||answered_weight from public.fin_provider_reviews where id=(select value from rp_ids where key='review1')) <> '80.000/60.000' then
    raise exception 'média ponderada do cliente incorreta';
  end if;
  if (select status from public.fin_scorecard_templates where id=(select value from rp_ids where key='tpl1')) <> 'retired'
     or (select version from public.fin_scorecard_templates where id=(select value from rp_ids where key='tpl2')) <> 2 then raise exception 'versão de template'; end if;
end $$;
do $$ begin
  update public.fin_scorecard_templates set criteria='[]'::jsonb where id=(select value from rp_ids where key='tpl2');
  raise exception 'critério do template reescrito';
exception when others then if sqlerrm <> 'immutable record' then raise; end if; end $$;
do $$ begin
  update public.fin_provider_reviews set weighted_result=100;
  raise exception 'avaliação reescrita';
exception when others then if sqlerrm <> 'immutable record' then raise; end if; end $$;

-- 3. Facilities, saldos, cronograma, garantias.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000aa002',false);
insert into rp_ids select 'fac_a', public.fin_save_facility('00000000-0000-4000-8000-0000000ab001',null,(select value from rp_ids where key='A'),'00000000-0000-4000-8000-0000000ab010',
  'revolving_credit','Conta garantida A','BRL',10000000,null,'cdi',1.8,null,null,current_date - 365,current_date + 400,'active',null,'contract','CCB 555',90,null,null);
select pg_temp.expect_error($q$select public.fin_save_facility('00000000-0000-4000-8000-0000000ab001',null,(select value from rp_ids where key='B'),'00000000-0000-4000-8000-0000000ab010','term_loan','Fora do escopo','USD',null,1000,null,null,null,null,null,null,'active',null,'declared',null,90,null,null)$q$, 'forbidden');
select pg_temp.expect_error($q$select public.fin_save_facility('00000000-0000-4000-8000-0000000ab001',null,(select value from rp_ids where key='A'),'00000000-0000-4000-8000-0000000ab010','term_loan','Sem valor','BRL',null,null,null,null,null,null,null,null,'active',null,'declared',null,90,null,null)$q$, 'invalid facility');
select public.fin_record_facility_balance((select value from rp_ids where key='fac_a'), current_date - 30, null, 4000000, 'statement', 'Extrato set/26');
select public.fin_record_facility_balance((select value from rp_ids where key='fac_a'), current_date, null, 6500000, 'declared', null);
select pg_temp.expect_error($q$select public.fin_record_facility_balance((select value from rp_ids where key='fac_a'), current_date, null, 20000000, 'declared', null)$q$, 'used limit exceeds approved');
select pg_temp.expect_error($q$select public.fin_record_facility_balance((select value from rp_ids where key='fac_a'), current_date + 1, null, 1, 'declared', null)$q$, 'invalid date');
-- Alteração material: limite aprovado sobe; histórico guarda antes/depois.
select public.fin_save_facility('00000000-0000-4000-8000-0000000ab001',(select value from rp_ids where key='fac_a'),(select value from rp_ids where key='A'),'00000000-0000-4000-8000-0000000ab010',
  'revolving_credit','Conta garantida A','BRL',12000000,null,'cdi',1.8,null,null,current_date - 365,current_date + 400,'active',null,'contract','Aditivo 1',90,null,null);
select public.fin_record_facility_schedule((select value from rp_ids where key='fac_a'), '[{"due_on":"2027-06-30","principal_amount":5000000},{"due_on":"2027-12-31","principal_amount":5000000}]'::jsonb, 0);
select pg_temp.expect_error($q$select public.fin_record_facility_schedule((select value from rp_ids where key='fac_a'), '[{"due_on":"2028-01-01","principal_amount":1}]'::jsonb, 0)$q$, 'schedule version conflict');
select public.fin_record_facility_schedule((select value from rp_ids where key='fac_a'), '[{"due_on":"2027-09-30","principal_amount":10000000}]'::jsonb, 1);
insert into rp_ids select 'gar_a', public.fin_save_guarantee('00000000-0000-4000-8000-0000000ab001',null,(select value from rp_ids where key='A'),'receivables','Cessão fiduciária de duplicatas','BRL',3000000,
  (select value from rp_ids where key='fac_a'),null,'00000000-0000-4000-8000-0000000ab010',current_date - 365,current_date + 400,'active','contract');
select pg_temp.expect_error($q$select public.fin_save_guarantee('00000000-0000-4000-8000-0000000ab001',null,(select value from rp_ids where key='B'),'aval','Aval fora do escopo','USD',1,null,null,null,null,null,'active','declared')$q$, 'forbidden');
select public.fin_confirm_facility((select value from rp_ids where key='fac_a'));
-- Leitura do analista restrito a A: sem nada de B; contato de grupo visível.
do $$ begin
  if exists (select 1 from public.fin_provider_relationships where legal_entity_id <> (select value from rp_ids where key='A'))
     or exists (select 1 from public.fin_provider_issues) or exists (select 1 from public.fin_provider_contacts where legal_entity_id is not null) then
    raise exception 'analista de A lê relacionamento de B';
  end if;
  if not exists (select 1 from public.fin_provider_contacts where id=(select value from rp_ids where key='contact_group')) then raise exception 'contato de grupo invisível'; end if;
  if (select count(*) from public.fin_facility_balances) <> 2 or (select count(*) from public.fin_facility_repayments) <> 3 then raise exception 'histórico de saldo/cronograma'; end if;
  if (select count(*) from public.fin_facility_history) < 1 then raise exception 'histórico da facility ausente'; end if;
end $$;
reset role;
do $$ begin
  if (select previous->>'approved_limit'||'>'||(current->>'approved_limit') from public.fin_facility_history where facility_id=(select value from rp_ids where key='fac_a') order by changed_at limit 1)
     <> '10000000.00>12000000.00' then raise exception 'histórico não registrou o limite anterior'; end if;
  if (select schedule_version from public.fin_facilities where id=(select value from rp_ids where key='fac_a')) <> 2 then raise exception 'versão do cronograma'; end if;
  if exists (select 1 from public.fin_events where event_type like 'facility_%' and metadata::text ~ '10000000|6500000|12000000') then raise exception 'valor vazou para a trilha'; end if;
  if (select legal_entity_id from public.fin_events where event_type='facility_created' and entity_id=(select value from rp_ids where key='fac_a')) <> (select value from rp_ids where key='A') then
    raise exception 'evento de facility sem entidade';
  end if;
end $$;
do $$ begin
  update public.fin_facility_balances set used_limit_amount = 0;
  raise exception 'saldo reescrito';
exception when others then if sqlerrm <> 'immutable record' then raise; end if; end $$;

-- 4. Viewer não escreve; outro tenant e provedor não leem.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000aa003',false);
select pg_temp.expect_error($q$select public.fin_add_provider_contact('00000000-0000-4000-8000-0000000ab001','00000000-0000-4000-8000-0000000ab010','Viewer escreve',null,null,null,null,false)$q$, 'forbidden');
select pg_temp.expect_error($q$select public.fin_record_facility_balance((select value from rp_ids where key='fac_a'), current_date, null, 1, 'declared', null)$q$, 'facility not found');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000aa004',false);
select pg_temp.expect_error($q$select public.fin_save_facility('00000000-0000-4000-8000-0000000ab001',(select value from rp_ids where key='fac_a'),null,'00000000-0000-4000-8000-0000000ab010','term_loan','Sequestro','BRL',null,1,null,null,null,null,null,null,'active',null,'declared',null,90,null,null)$q$, 'forbidden');
do $$ begin
  if exists (select 1 from public.fin_facilities) or exists (select 1 from public.fin_provider_contacts) or exists (select 1 from public.fin_scorecard_templates)
     or exists (select 1 from public.fin_provider_reviews) or exists (select 1 from public.fin_guarantees) or exists (select 1 from public.fin_facility_balances) then
    raise exception 'outro tenant lê portfólio';
  end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000aa005',false);
do $$ begin
  -- O provedor vinculado (provider_organization_id) não lê nota, contato, avaliação nem facility do comprador.
  if exists (select 1 from public.fin_provider_reviews) or exists (select 1 from public.fin_provider_contacts) or exists (select 1 from public.fin_provider_issues)
     or exists (select 1 from public.fin_facilities) or exists (select 1 from public.fin_scorecard_templates) or exists (select 1 from public.fin_provider_relationships) then
    raise exception 'provedor lê relacionamento/avaliação do comprador';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',false);

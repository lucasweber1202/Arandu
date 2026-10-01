\set ON_ERROR_STOP on
-- Financial Passport v2 (docs/supabase-financial-passport.sql): proveniência,
-- histórico append-only, frescor, documento privado do perfil, snapshot
-- imutável na RFQ e negações para provedor, outro tenant, papel fraco, externo,
-- operador da plataforma e sessão ausente.
insert into auth.users(id,email) values
('00000000-0000-4000-8000-0000000da001','pp-manager@example.invalid'),
('00000000-0000-4000-8000-0000000da002','pp-analyst@example.invalid'),
('00000000-0000-4000-8000-0000000da003','pp-viewer@example.invalid'),
('00000000-0000-4000-8000-0000000da004','pp-other-buyer@example.invalid'),
('00000000-0000-4000-8000-0000000da005','pp-provider@example.invalid'),
('00000000-0000-4000-8000-0000000da006','pp-outsider@example.invalid'),
('00000000-0000-4000-8000-0000000da007','pp-operator@example.invalid')
on conflict(id) do nothing;
insert into public.fin_organizations(id,legal_name,kind,sector,created_by) values
('00000000-0000-4000-8000-0000000db001','Compradora Passport DEMO','BUYER','Alimentos','00000000-0000-4000-8000-0000000da001'),
('00000000-0000-4000-8000-0000000db002','Outra compradora DEMO','BUYER',null,'00000000-0000-4000-8000-0000000da004'),
('00000000-0000-4000-8000-0000000db003','Provedor Passport DEMO','PROVIDER',null,'00000000-0000-4000-8000-0000000da005');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-0000000db001','00000000-0000-4000-8000-0000000da001','finance_manager'),
('00000000-0000-4000-8000-0000000db001','00000000-0000-4000-8000-0000000da002','analyst'),
('00000000-0000-4000-8000-0000000db001','00000000-0000-4000-8000-0000000da003','viewer'),
('00000000-0000-4000-8000-0000000db002','00000000-0000-4000-8000-0000000da004','admin'),
('00000000-0000-4000-8000-0000000db003','00000000-0000-4000-8000-0000000da005','provider_user');
insert into public.fin_platform_operators(user_id,granted_by) values ('00000000-0000-4000-8000-0000000da007','teste do Passport')
on conflict(user_id) do nothing;
-- Documentos privados: um do perfil da compradora, um de RFQ, um da outra empresa.
insert into public.fin_rfqs(id,organization_id,product,title,owner_id,status,demand) values
('00000000-0000-4000-8000-0000000dc001','00000000-0000-4000-8000-0000000db001','credit','RFQ antiga DEMO',
 '00000000-0000-4000-8000-0000000da001','collecting','{"amount":100000}'::jsonb);
insert into public.fin_private_documents(id,organization_id,buyer_organization_id,entity_type,entity_id,rfq_id,title,visibility,current_version,created_by) values
('00000000-0000-4000-8000-0000000dd001','00000000-0000-4000-8000-0000000db001','00000000-0000-4000-8000-0000000db001','profile','00000000-0000-4000-8000-0000000db001',null,'Contrato social DEMO','internal',1,'00000000-0000-4000-8000-0000000da001'),
('00000000-0000-4000-8000-0000000dd002','00000000-0000-4000-8000-0000000db001','00000000-0000-4000-8000-0000000db001','rfq','00000000-0000-4000-8000-0000000dc001','00000000-0000-4000-8000-0000000dc001','Anexo da RFQ DEMO','internal',1,'00000000-0000-4000-8000-0000000da001'),
('00000000-0000-4000-8000-0000000dd003','00000000-0000-4000-8000-0000000db002','00000000-0000-4000-8000-0000000db002','profile','00000000-0000-4000-8000-0000000db002',null,'Documento de outra empresa DEMO','internal',1,'00000000-0000-4000-8000-0000000da004');
-- Provedor com convite ACEITO na RFQ antiga: participa do processo, não do Passport.
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
('00000000-0000-4000-8000-0000000de001','00000000-0000-4000-8000-0000000db001','Banco Passport DEMO','bank','00000000-0000-4000-8000-0000000da001');
insert into public.fin_rfq_invites(id,buyer_organization_id,rfq_id,provider_id,provider_organization_id,token_hash,created_by,status,recipient_mode) values
('00000000-0000-4000-8000-0000000de002','00000000-0000-4000-8000-0000000db001','00000000-0000-4000-8000-0000000dc001',
 '00000000-0000-4000-8000-0000000de001','00000000-0000-4000-8000-0000000db003',encode(sha256(convert_to('passport-fixture','UTF8')),'hex'),
 '00000000-0000-4000-8000-0000000da001','accepted','organization_open');

create temporary table pp_ids(key text primary key, value uuid);
grant all on pp_ids to authenticated;

-- 1. Escrita só por RPC. A escrita direta do cliente foi revogada.
do $$ begin
  if has_table_privilege('authenticated','public.fin_company_profiles','INSERT')
     or has_table_privilege('authenticated','public.fin_company_profiles','UPDATE') then
    raise exception 'escrita direta no Passport ainda exposta';
  end if;
  if has_table_privilege('authenticated','public.fin_company_profile_history','INSERT')
     or has_table_privilege('authenticated','public.fin_rfq_profile_snapshots','INSERT')
     or has_table_privilege('anon','public.fin_company_profile_history','SELECT')
     or has_table_privilege('anon','public.fin_rfq_profile_snapshots','SELECT') then
    raise exception 'histórico ou snapshot gravável/legível fora do caminho previsto';
  end if;
  if has_function_privilege('authenticated','public.fin_profile_history_trigger()','EXECUTE')
     or has_function_privilege('authenticated','public.fin_immutable_row()','EXECUTE') then
    raise exception 'gatilho do Passport exposto ao cliente';
  end if;
end $$;

-- 2. Gestor grava, analista grava e confirma; histórico registra cada passo.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000da001',false);
select public.fin_passport_set_field('00000000-0000-4000-8000-0000000db001','receita_anual','182000000','documento_interno',null,null,365);
select public.fin_passport_set_field('00000000-0000-4000-8000-0000000db001','garantias_disponiveis','Recebíveis de cartão','declarado_pela_empresa');
select public.fin_passport_set_field('00000000-0000-4000-8000-0000000db001','doc_contrato_social','Versão consolidada','documento_interno',
  '00000000-0000-4000-8000-0000000dd001'::uuid,null,730);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000da002',false);
select public.fin_passport_set_field('00000000-0000-4000-8000-0000000db001','receita_anual','190000000','documento_interno',null,null,365);
select public.fin_passport_confirm_field('00000000-0000-4000-8000-0000000db001','receita_anual');
reset role;
do $$ declare v record; begin
  select * into v from public.fin_company_profiles where organization_id='00000000-0000-4000-8000-0000000db001' and field_key='receita_anual';
  if v.field_value <> '190000000' or v.updated_by <> '00000000-0000-4000-8000-0000000da002' or v.verified_by <> '00000000-0000-4000-8000-0000000da002'
     or v.verified_at is null or v.review_after_days <> 365 or v.status <> 'revisado' then
    raise exception 'proveniência do campo incompleta: %', row_to_json(v);
  end if;
  if (select string_agg(change_type || ':' || coalesce(previous_value,'-') || '>' || new_value, ',' order by changed_at, change_type)
        from public.fin_company_profile_history where organization_id='00000000-0000-4000-8000-0000000db001' and field_key='receita_anual')
     <> 'created:->182000000,updated:182000000>190000000,confirmed:190000000>190000000' then
    raise exception 'histórico do Passport não registrou criação, alteração e confirmação: %',
      (select string_agg(change_type, ',') from public.fin_company_profile_history where field_key='receita_anual');
  end if;
  if (select document_id from public.fin_company_profiles where field_key='doc_contrato_social' and organization_id='00000000-0000-4000-8000-0000000db001')
     <> '00000000-0000-4000-8000-0000000dd001' then raise exception 'documento do perfil não vinculado'; end if;
  -- A trilha guarda o campo, não o valor.
  if exists(select 1 from public.fin_events where organization_id='00000000-0000-4000-8000-0000000db001'
            and event_type like 'profile_field_%' and metadata::text ~ '1[89]0?000000') then
    raise exception 'valor do Passport vazou para a trilha';
  end if;
end $$;

-- Regravar o mesmo valor preserva a confirmação; mudar o valor a descarta.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000da001',false);
select public.fin_passport_set_field('00000000-0000-4000-8000-0000000db001','receita_anual','190000000','documento_interno',null,null,365);
reset role;
do $$ begin
  if (select verified_at from public.fin_company_profiles where field_key='receita_anual' and organization_id='00000000-0000-4000-8000-0000000db001') is null then
    raise exception 'regravar o mesmo valor apagou a confirmação'; end if;
end $$;

-- 3. Histórico imutável, mesmo para o dono do banco.
do $$ begin
  update public.fin_company_profile_history set new_value='adulterado' where field_key='receita_anual';
  raise exception 'histórico do Passport foi reescrito';
exception when others then if sqlerrm <> 'immutable record' then raise; end if; end $$;

-- 4. Frescor: mesma regra da interface (lib/finance/passport.mjs).
do $$ begin
  if public.fin_passport_review_due('2026-01-01T12:00:00Z','2026-03-01T12:00:00Z',90,null) <> date '2026-05-30' then raise exception 'vencimento usa confirmação'; end if;
  if public.fin_passport_review_due('2026-01-01T12:00:00Z',null,180,date '2026-02-01') <> date '2026-02-01' then raise exception 'validade explícita não antecipa'; end if;
  if public.fin_passport_freshness(date '2026-05-30', date '2026-04-29') <> 'current' then raise exception 'frescor current'; end if;
  if public.fin_passport_freshness(date '2026-05-30', date '2026-04-30') <> 'review_due' then raise exception 'frescor review_due'; end if;
  if public.fin_passport_freshness(date '2026-05-30', date '2026-05-30') <> 'review_due' then raise exception 'frescor no dia do vencimento'; end if;
  if public.fin_passport_freshness(date '2026-05-30', date '2026-05-31') <> 'stale' then raise exception 'frescor stale'; end if;
end $$;

-- 5. RFQ criada a partir do Passport guarda snapshot imutável.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000da001',false);
insert into pp_ids select 'rfq', public.fin_create_rfq_from_passport('00000000-0000-4000-8000-0000000db001','credit','Capital de giro Passport DEMO',null,
  '{"amount":500000,"purpose":"capital_de_giro","term_months":24,"annual_revenue":190000000,"sector":"Alimentos","collateral":"Duplicatas"}'::jsonb, null,
  '[{"demand_key":"annual_revenue","field_key":"receita_anual"},{"demand_key":"sector","field_key":"sector"},{"demand_key":"collateral","field_key":"garantias_disponiveis"}]'::jsonb);
-- Mudança posterior no Passport não alcança a RFQ.
select public.fin_passport_set_field('00000000-0000-4000-8000-0000000db001','receita_anual','250000000','documento_interno',null,null,365);
reset role;
do $$ declare v_rfq uuid := (select value from pp_ids where key='rfq'); begin
  if (select count(*) from public.fin_rfq_profile_snapshots where rfq_id=v_rfq) <> 3 then raise exception 'snapshot incompleto'; end if;
  if (select field_value from public.fin_rfq_profile_snapshots where rfq_id=v_rfq and field_key='receita_anual') <> '190000000' then
    raise exception 'snapshot acompanhou a mudança posterior do Passport'; end if;
  if not (select used_as_is from public.fin_rfq_profile_snapshots where rfq_id=v_rfq and field_key='receita_anual') then
    raise exception 'valor numérico igual ao do Passport não reconhecido'; end if;
  if (select used_as_is from public.fin_rfq_profile_snapshots where rfq_id=v_rfq and field_key='garantias_disponiveis') then
    raise exception 'valor editado na RFQ marcado como usado sem alteração'; end if;
  if (select source || '/' || freshness from public.fin_rfq_profile_snapshots where rfq_id=v_rfq and field_key='sector') <> 'cadastro_organizacao/untracked' then
    raise exception 'setor do cadastro sem origem própria'; end if;
  if (select freshness from public.fin_rfq_profile_snapshots where rfq_id=v_rfq and field_key='receita_anual') <> 'current' then
    raise exception 'frescor não fotografado'; end if;
  if (select (demand->>'annual_revenue')::numeric from public.fin_rfqs where id=v_rfq) <> 190000000 then raise exception 'demanda alterada'; end if;
end $$;
do $$ begin
  update public.fin_rfq_profile_snapshots set field_value='0';
  raise exception 'snapshot da RFQ foi reescrito';
exception when others then if sqlerrm <> 'immutable record' then raise; end if; end $$;
do $$ begin
  delete from public.fin_rfq_profile_snapshots;
  raise exception 'snapshot da RFQ foi apagado';
exception when others then if sqlerrm <> 'immutable record' then raise; end if; end $$;

-- Nem a chave de serviço apaga fora da demonstração; na demo, o reset apaga.
do $$ begin
  if exists(select 1 from public.fin_settings where key='deployment_environment' and value='demo') then
    raise exception 'fixture: banco de teste não deveria estar marcado como demo';
  end if;
end $$;
set role service_role;
do $$ begin
  delete from public.fin_company_profile_history where organization_id='00000000-0000-4000-8000-0000000db001';
  raise exception 'chave de serviço apagou histórico fora da demonstração';
exception when others then if sqlerrm <> 'immutable record' then raise; end if; end $$;
reset role;
begin;
insert into public.fin_settings(key,value) values ('deployment_environment','demo')
  on conflict (key) do update set value = excluded.value;
set local role service_role;
delete from public.fin_rfq_profile_snapshots where organization_id='00000000-0000-4000-8000-0000000db001';
do $$ begin
  if exists(select 1 from public.fin_rfq_profile_snapshots where organization_id='00000000-0000-4000-8000-0000000db001') then
    raise exception 'reset da demonstração não conseguiu apagar o snapshot';
  end if;
  update public.fin_company_profile_history set new_value = 'x' where organization_id='00000000-0000-4000-8000-0000000db001';
  raise exception 'histórico reescrito na demonstração';
exception when others then if sqlerrm <> 'immutable record' then raise; end if; end $$;
rollback;

-- 6. Leituras: compradora vê; provedor (mesmo com convite aceito), outro tenant,
--    externo e operador da plataforma não veem nada do Passport.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000da003',false);
do $$ begin
  if (select count(*) from public.fin_company_profiles) < 3 or (select count(*) from public.fin_company_profile_history) < 4
     or (select count(*) from public.fin_rfq_profile_snapshots) <> 3 then raise exception 'viewer da compradora não lê o próprio Passport'; end if;
end $$;
do $$
declare actor text;
begin
  foreach actor in array array['da004','da005','da006','da007'] loop
    perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000' || actor, false);
    if exists(select 1 from public.fin_company_profiles where organization_id='00000000-0000-4000-8000-0000000db001')
       or exists(select 1 from public.fin_company_profile_history where organization_id='00000000-0000-4000-8000-0000000db001')
       or exists(select 1 from public.fin_rfq_profile_snapshots where organization_id='00000000-0000-4000-8000-0000000db001') then
      raise exception 'ator % lê o Passport da compradora', actor;
    end if;
  end loop;
  -- O provedor convidado continua lendo a RFQ do processo: só o Passport é fechado.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000da005', false);
  if not exists(select 1 from public.fin_rfqs where id='00000000-0000-4000-8000-0000000dc001') then
    raise exception 'fixture: provedor convidado deveria ler a RFQ';
  end if;
end $$;

-- 7. Matriz de escrita: cada tentativa precisa falhar.
create temporary table pp_attacks(actor text, label text, stmt text, expected text);
grant all on pp_attacks to authenticated;
insert into pp_attacks values
 ('da003','viewer grava campo',$q$select public.fin_passport_set_field('00000000-0000-4000-8000-0000000db001','porte','grande','outro')$q$,'forbidden'),
 ('da003','viewer confirma campo',$q$select public.fin_passport_confirm_field('00000000-0000-4000-8000-0000000db001','receita_anual')$q$,'forbidden'),
 ('da004','outro tenant grava no Passport de A',$q$select public.fin_passport_set_field('00000000-0000-4000-8000-0000000db001','porte','me','outro')$q$,'forbidden'),
 ('da004','outro tenant confirma em A',$q$select public.fin_passport_confirm_field('00000000-0000-4000-8000-0000000db001','receita_anual')$q$,'forbidden'),
 ('da004','outro tenant cria RFQ de A com o Passport de A',$q$select public.fin_create_rfq_from_passport('00000000-0000-4000-8000-0000000db001','credit','Invasão',null,'{"amount":1,"purpose":"outro","term_months":1}',null,'[]')$q$,'forbidden'),
 ('da004','outro tenant fotografa campo de A na própria RFQ',$q$select public.fin_create_rfq_from_passport('00000000-0000-4000-8000-0000000db002','credit','Invasão',null,'{"amount":1,"purpose":"outro","term_months":1}',null,'[{"demand_key":"annual_revenue","field_key":"receita_anual"}]')$q$,'invalid passport usage'),
 ('da004','outro tenant vincula documento de A',$q$select public.fin_passport_set_field('00000000-0000-4000-8000-0000000db002','doc_contrato_social','x','documento_interno','00000000-0000-4000-8000-0000000dd001')$q$,'invalid profile document'),
 ('da005','provedor grava no Passport da compradora',$q$select public.fin_passport_set_field('00000000-0000-4000-8000-0000000db001','porte','me','outro')$q$,'forbidden'),
 ('da005','provedor grava Passport na própria org',$q$select public.fin_passport_set_field('00000000-0000-4000-8000-0000000db003','porte','me','outro')$q$,'forbidden'),
 ('da006','externo grava',$q$select public.fin_passport_set_field('00000000-0000-4000-8000-0000000db001','porte','me','outro')$q$,'forbidden'),
 ('da007','operador grava',$q$select public.fin_passport_set_field('00000000-0000-4000-8000-0000000db001','porte','me','outro')$q$,'forbidden'),
 ('da002','analista cria RFQ (papel insuficiente)',$q$select public.fin_create_rfq_from_passport('00000000-0000-4000-8000-0000000db001','credit','x',null,'{"amount":1,"purpose":"outro","term_months":1}',null,'[]')$q$,'forbidden'),
 ('da001','origem reservada declarada à mão',$q$select public.fin_passport_set_field('00000000-0000-4000-8000-0000000db001','porte','me','integracao')$q$,'invalid profile source'),
 ('da001','documento de RFQ como documento do perfil',$q$select public.fin_passport_set_field('00000000-0000-4000-8000-0000000db001','doc_certidoes','x','documento_interno','00000000-0000-4000-8000-0000000dd002')$q$,'invalid profile document'),
 ('da001','documento de outra empresa',$q$select public.fin_passport_set_field('00000000-0000-4000-8000-0000000db001','doc_certidoes','x','documento_interno','00000000-0000-4000-8000-0000000dd003')$q$,'invalid profile document'),
 ('da001','chave malformada',$q$select public.fin_passport_set_field('00000000-0000-4000-8000-0000000db001','Receita Anual','1','outro')$q$,'invalid profile field'),
 ('da001','valor com marcação',$q$select public.fin_passport_set_field('00000000-0000-4000-8000-0000000db001','porte','<script>','outro')$q$,'invalid profile value'),
 ('da001','período de revisão fora do intervalo',$q$select public.fin_passport_set_field('00000000-0000-4000-8000-0000000db001','porte','me','outro',null,null,3)$q$,'invalid review period'),
 ('da001','confirmar campo inexistente',$q$select public.fin_passport_confirm_field('00000000-0000-4000-8000-0000000db001','nao_existe')$q$,'invalid profile field'),
 ('da001','snapshot de campo vazio',$q$select public.fin_create_rfq_from_passport('00000000-0000-4000-8000-0000000db001','credit','Snapshot vazio DEMO',null,'{"amount":1,"purpose":"outro","term_months":1}',null,'[{"demand_key":"operating_years","field_key":"tempo_operacao_anos"}]')$q$,'invalid passport usage'),
 ('da001','snapshot malformado',$q$select public.fin_create_rfq_from_passport('00000000-0000-4000-8000-0000000db001','credit','x',null,'{"amount":1,"purpose":"outro","term_months":1}',null,'{"x":1}')$q$,'invalid passport usage'),
 ('','sem sessão grava',$q$select public.fin_passport_set_field('00000000-0000-4000-8000-0000000db001','porte','me','outro')$q$,'authentication required'),
 ('','sem sessão confirma',$q$select public.fin_passport_confirm_field('00000000-0000-4000-8000-0000000db001','receita_anual')$q$,'authentication required');
-- Escrita direta, mesmo por quem pode gravar pela RPC.
insert into pp_attacks values
 ('da001','gestor grava direto na tabela',$q$insert into public.fin_company_profiles(organization_id,field_key,field_value,updated_by) values ('00000000-0000-4000-8000-0000000db001','porte','me','00000000-0000-4000-8000-0000000da001')$q$,'permission denied for table fin_company_profiles'),
 ('da001','gestor altera direto na tabela',$q$update public.fin_company_profiles set field_value='1' where field_key='receita_anual'$q$,'permission denied for table fin_company_profiles'),
 ('da001','gestor grava direto no histórico',$q$insert into public.fin_company_profile_history(organization_id,field_key,change_type) values ('00000000-0000-4000-8000-0000000db001','x','created')$q$,'permission denied for table fin_company_profile_history');

set role authenticated;
do $$
declare a record; v_problems text := '';
begin
  for a in select * from pp_attacks loop
    perform set_config('request.jwt.claim.sub', case when a.actor = '' then '' else '00000000-0000-4000-8000-0000000' || a.actor end, false);
    begin
      execute a.stmt;
      v_problems := v_problems || a.label || ' (aceito); ';
    exception when others then
      if sqlerrm <> a.expected then v_problems := v_problems || a.label || ' (' || sqlerrm || '); '; end if;
    end;
  end loop;
  if v_problems <> '' then raise exception 'matriz do Passport: %', v_problems; end if;
end $$;
reset role;

-- Nada da matriz deixou rastro.
do $$ begin
  if exists(select 1 from public.fin_company_profiles where field_key in ('porte','doc_certidoes'))
     or (select count(*) from public.fin_rfqs where title in ('Invasão','x','Snapshot vazio DEMO')) > 0 then
    raise exception 'tentativa recusada deixou dado gravado';
  end if;
end $$;

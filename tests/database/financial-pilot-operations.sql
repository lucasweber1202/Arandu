\set ON_ERROR_STOP on
-- Operação real do piloto:
-- 1. vínculo do convite: um concorrente com o link de outro provedor não ocupa a
--    vaga dele, e uma conta provedora não responde duas vezes na RFQ;
-- 2. janela de envio: reserva de upload com mais de 10 minutos não é concluída.
insert into auth.users(id,email) values
('00000000-0000-4000-8000-00000000f101','ib-buyer@example.invalid'),
('00000000-0000-4000-8000-00000000f102','ib-provider-a@example.invalid'),
('00000000-0000-4000-8000-00000000f103','ib-provider-b@example.invalid')
on conflict(id) do nothing;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-00000000f201','Compradora IB DEMO','BUYER','00000000-0000-4000-8000-00000000f101'),
('00000000-0000-4000-8000-00000000f202','Provedor A IB DEMO','PROVIDER','00000000-0000-4000-8000-00000000f102'),
('00000000-0000-4000-8000-00000000f203','Provedor B IB DEMO','PROVIDER','00000000-0000-4000-8000-00000000f103')
on conflict do nothing;
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-00000000f201','00000000-0000-4000-8000-00000000f101','admin'),
('00000000-0000-4000-8000-00000000f202','00000000-0000-4000-8000-00000000f102','provider_user'),
('00000000-0000-4000-8000-00000000f203','00000000-0000-4000-8000-00000000f103','provider_user')
on conflict do nothing;
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
('00000000-0000-4000-8000-00000000f301','00000000-0000-4000-8000-00000000f201','Banco A IB DEMO','bank','00000000-0000-4000-8000-00000000f101'),
('00000000-0000-4000-8000-00000000f302','00000000-0000-4000-8000-00000000f201','Banco B IB DEMO','bank','00000000-0000-4000-8000-00000000f101')
on conflict do nothing;
insert into public.fin_rfqs(id,organization_id,product,title,status,owner_id,demand) values
('00000000-0000-4000-8000-00000000f401','00000000-0000-4000-8000-00000000f201','credit','RFQ IB 1 DEMO','open','00000000-0000-4000-8000-00000000f101','{}'),
('00000000-0000-4000-8000-00000000f402','00000000-0000-4000-8000-00000000f201','credit','RFQ IB 2 DEMO','open','00000000-0000-4000-8000-00000000f101','{}')
on conflict do nothing;
create temporary table ib_tokens(key text primary key, token text);
grant all on ib_tokens to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000f101',false);
insert into ib_tokens values
 ('a1', public.fin_invite_provider('00000000-0000-4000-8000-00000000f401','00000000-0000-4000-8000-00000000f301')),
 ('b1', public.fin_invite_provider('00000000-0000-4000-8000-00000000f401','00000000-0000-4000-8000-00000000f302')),
 ('a2', public.fin_invite_provider('00000000-0000-4000-8000-00000000f402','00000000-0000-4000-8000-00000000f301'));

-- B aceita o próprio convite; depois tenta ocupar também a vaga de A.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000f103',false);
select public.fin_accept_provider_invite((select token from ib_tokens where key='b1'),'00000000-0000-4000-8000-00000000f203');
-- Recusa devolve null (erro genérico na API) desde o hardening final; antes era exceção.
do $$ declare v uuid; begin
  begin
    v := public.fin_accept_provider_invite((select token from ib_tokens where key='a1'),'00000000-0000-4000-8000-00000000f203');
  exception when others then
    if sqlerrm <> 'invalid invitation' then raise; end if;
    v := null;
  end;
  if v is not null then raise exception 'provedor B ocupou a vaga de A na mesma RFQ'; end if;
end $$;

-- A continua podendo aceitar o próprio convite (não foi consumido pela tentativa).
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000f102',false);
select public.fin_accept_provider_invite((select token from ib_tokens where key='a1'),'00000000-0000-4000-8000-00000000f202');

-- Em outra RFQ, o cadastro "Banco A" já é da conta A: B não o assume com o link.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000f103',false);
-- Recusa devolve null (erro genérico na API) desde o hardening final; antes era exceção.
do $$ declare v uuid; begin
  begin
    v := public.fin_accept_provider_invite((select token from ib_tokens where key='a2'),'00000000-0000-4000-8000-00000000f203');
  exception when others then
    if sqlerrm <> 'invalid invitation' then raise; end if;
    v := null;
  end;
  if v is not null then raise exception 'provedor B assumiu o cadastro canônico de A'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000f102',false);
select public.fin_accept_provider_invite((select token from ib_tokens where key='a2'),'00000000-0000-4000-8000-00000000f202');
reset role;

do $$ begin
  if (select count(*) from public.fin_proposals where provider_organization_id='00000000-0000-4000-8000-00000000f203') <> 1 then
    raise exception 'B deveria ter exatamente uma proposta';
  end if;
  if (select count(*) from public.fin_proposals where provider_organization_id='00000000-0000-4000-8000-00000000f202') <> 2 then
    raise exception 'A deveria ter uma proposta em cada RFQ';
  end if;
  if (select provider_organization_id from public.fin_providers where id='00000000-0000-4000-8000-00000000f301') <> '00000000-0000-4000-8000-00000000f202' then
    raise exception 'cadastro de A não ficou vinculado à conta A';
  end if;
end $$;
drop table ib_tokens;

-- ------------------------------------------------ janela de envio (10 min)
create temporary table ib_slots(key text primary key, document_id uuid);
grant all on ib_slots to authenticated, service_role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000f101',false);
insert into ib_slots select 'late', document_id from public.fin_document_begin_upload('00000000-0000-4000-8000-00000000f201','rfq','00000000-0000-4000-8000-00000000f401','Envio atrasado DEMO','internal','application/pdf',100);
insert into ib_slots select 'fresh', document_id from public.fin_document_begin_upload('00000000-0000-4000-8000-00000000f201','rfq','00000000-0000-4000-8000-00000000f401','Envio em dia DEMO','internal','application/pdf',100);
reset role;
update public.fin_document_versions set created_at = now() - interval '11 minutes'
 where document_id = (select document_id from ib_slots where key = 'late');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000f101',false);
do $$ begin
  if exists (select 1 from public.fin_document_pending_upload((select document_id from ib_slots where key='late'), 1)) then
    raise exception 'reserva de envio vencida ainda aparece como pendente';
  end if;
  if not exists (select 1 from public.fin_document_pending_upload((select document_id from ib_slots where key='fresh'), 1)) then
    raise exception 'reserva de envio em dia não aparece como pendente';
  end if;
end $$;
reset role;
set role service_role;
do $$ begin
  if public.fin_document_finalize_upload((select document_id from ib_slots where key='late'), 1, 100, 'application/pdf') <> 'failed' then
    raise exception 'envio vencido foi disponibilizado';
  end if;
  if public.fin_document_finalize_upload((select document_id from ib_slots where key='fresh'), 1, 100, 'application/pdf') <> 'available' then
    raise exception 'envio em dia não foi disponibilizado';
  end if;
end $$;
reset role;
drop table ib_slots;

-- ------------------------------------ aviso por marco com a tarefa já aberta
-- fin_register_contract abre a tarefa de revisão junto com o contrato; a agenda
-- precisa avisar mesmo assim, uma vez por marco.
insert into public.fin_decisions(id,organization_id,rfq_id,proposal_id,decided_by,criteria,snapshot)
select '00000000-0000-4000-8000-00000000f501','00000000-0000-4000-8000-00000000f201','00000000-0000-4000-8000-00000000f401',
       p.id,'00000000-0000-4000-8000-00000000f101','{}'::jsonb,'{}'::jsonb
from public.fin_proposals p where p.rfq_id='00000000-0000-4000-8000-00000000f401' and p.provider_organization_id='00000000-0000-4000-8000-00000000f202'
on conflict do nothing;
insert into public.fin_contracts(id,organization_id,decision_id,proposal_id,provider_id,product,starts_on,ends_on,renewal_notice_days,owner_id)
select '00000000-0000-4000-8000-00000000f601',d.organization_id,d.id,d.proposal_id,p.provider_id,'credit',current_date,current_date+85,30,'00000000-0000-4000-8000-00000000f101'
from public.fin_decisions d join public.fin_proposals p on p.id=d.proposal_id where d.id='00000000-0000-4000-8000-00000000f501'
on conflict do nothing;
insert into public.fin_tasks(organization_id,title,status,related_type,related_id,created_by)
values ('00000000-0000-4000-8000-00000000f201','Revisar renovação do contrato antes do aviso prévio','open','contract','00000000-0000-4000-8000-00000000f601','00000000-0000-4000-8000-00000000f101');
set role service_role;
select public.fin_run_renewal_schedule();
select public.fin_run_renewal_schedule();
reset role;
update public.fin_contracts set ends_on = current_date + 55 where id='00000000-0000-4000-8000-00000000f601';
set role service_role;
select public.fin_run_renewal_schedule();
select public.fin_run_renewal_schedule();
reset role;
do $$ begin
  if (select string_agg(milestone, ',' order by milestone) from public.fin_renewal_milestones where contract_id='00000000-0000-4000-8000-00000000f601') <> 'd60,d90' then
    raise exception 'marcos inesperados';
  end if;
  if (select count(*) from public.fin_notifications where object_id='00000000-0000-4000-8000-00000000f601' and event_type='renewal_due') <> 2 then
    raise exception 'aviso de renovação deveria sair uma vez por marco (2)';
  end if;
  if (select count(*) from public.fin_tasks where related_id='00000000-0000-4000-8000-00000000f601' and status='open') <> 1 then
    raise exception 'tarefa de renovação duplicada';
  end if;
end $$;

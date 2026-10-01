\set ON_ERROR_STOP on
-- Aprovação sequencial (docs/supabase-financial-approval-handoff.sql): cada
-- aprovador é avisado quando chega a vez dele, uma única vez; quem já votou,
-- rejeitou ou concluiu não gera aviso para etapa inexistente.
insert into auth.users(id,email) values
('00000000-0000-4000-8000-00000000ce01','buyer-handoff@example.invalid'),
('00000000-0000-4000-8000-00000000ce02','controller-handoff@example.invalid'),
('00000000-0000-4000-8000-00000000ce03','cfo-handoff@example.invalid')
on conflict(id) do nothing;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-00000000cf01','Empresa handoff DEMO','BUYER','00000000-0000-4000-8000-00000000ce01'),
('00000000-0000-4000-8000-00000000cf02','Provedor handoff DEMO','PROVIDER','00000000-0000-4000-8000-00000000ce01');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-00000000cf01','00000000-0000-4000-8000-00000000ce01','finance_manager'),
('00000000-0000-4000-8000-00000000cf01','00000000-0000-4000-8000-00000000ce02','viewer'),
('00000000-0000-4000-8000-00000000cf01','00000000-0000-4000-8000-00000000ce03','admin');
insert into public.fin_rfqs(id,organization_id,product,title,owner_id,status,demand) values
('00000000-0000-4000-8000-00000000cf11','00000000-0000-4000-8000-00000000cf01','credit','Handoff DEMO',
 '00000000-0000-4000-8000-00000000ce01','comparing','{"amount":100000}'::jsonb);
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
('00000000-0000-4000-8000-00000000cf03','00000000-0000-4000-8000-00000000cf01','Banco handoff DEMO','bank','00000000-0000-4000-8000-00000000ce01');
insert into public.fin_rfq_invites(id,buyer_organization_id,rfq_id,provider_id,provider_organization_id,token_hash,created_by,status,recipient_mode) values
('00000000-0000-4000-8000-00000000cf04','00000000-0000-4000-8000-00000000cf01','00000000-0000-4000-8000-00000000cf11',
 '00000000-0000-4000-8000-00000000cf03','00000000-0000-4000-8000-00000000cf02',encode(sha256(convert_to('approval-handoff-fixture','UTF8')),'hex'),'00000000-0000-4000-8000-00000000ce01','accepted','organization_open');
insert into public.fin_proposals(id,invite_id,rfq_id,buyer_organization_id,provider_id,provider_organization_id,product,status,current_version) values
('00000000-0000-4000-8000-00000000cf12','00000000-0000-4000-8000-00000000cf04','00000000-0000-4000-8000-00000000cf11',
 '00000000-0000-4000-8000-00000000cf01','00000000-0000-4000-8000-00000000cf03','00000000-0000-4000-8000-00000000cf02','credit','submitted',1);
insert into public.fin_proposal_versions(proposal_id,version,terms,submitted_by) values
('00000000-0000-4000-8000-00000000cf12',1,'{"interest_rate_month":1.4}'::jsonb,'00000000-0000-4000-8000-00000000ce01');
create temporary table handoff_ids(key text primary key,value uuid);
grant all on handoff_ids to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ce01',false);
insert into handoff_ids select 'request',public.fin_request_approval('00000000-0000-4000-8000-00000000cf11'::uuid,
 '00000000-0000-4000-8000-00000000cf12'::uuid,
 array['00000000-0000-4000-8000-00000000ce02'::uuid,'00000000-0000-4000-8000-00000000ce03'::uuid],'Cadeia Controller → CFO');
reset role;
do $$
begin
 if (select count(*) from public.fin_notifications where user_id='00000000-0000-4000-8000-00000000ce02' and event_type='approval_requested') <> 1
 then raise exception 'primeiro aprovador não foi avisado'; end if;
 if exists(select 1 from public.fin_notifications where user_id='00000000-0000-4000-8000-00000000ce03')
 then raise exception 'segundo aprovador avisado antes da vez dele'; end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ce02',false);
select public.fin_act_on_approval((select value from handoff_ids where key='request'),'approved','De acordo.');
reset role;
do $$
begin
 if (select count(*) from public.fin_notifications where user_id='00000000-0000-4000-8000-00000000ce03' and event_type='approval_requested'
     and object_type='rfq' and object_id='00000000-0000-4000-8000-00000000cf11') <> 1
 then raise exception 'próximo aprovador não foi avisado quando chegou a vez dele'; end if;
 if (select count(*) from public.fin_notifications where user_id='00000000-0000-4000-8000-00000000ce01' and event_type='approval_approved') <> 1
 then raise exception 'solicitante deixou de ser avisado do voto'; end if;
 if (select body from public.fin_notifications where user_id='00000000-0000-4000-8000-00000000ce03') ~ '[0-9]{2,}|%'
 then raise exception 'aviso do próximo aprovador carrega condição financeira'; end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ce03',false);
select public.fin_act_on_approval((select value from handoff_ids where key='request'),'approved','Aprovado.');
reset role;
do $$
begin
 -- Concluída a cadeia: ninguém mais é chamado a aprovar.
 if (select count(*) from public.fin_notifications where event_type='approval_requested'
     and organization_id='00000000-0000-4000-8000-00000000cf01') <> 2
 then raise exception 'aviso de aprovação extra depois da última etapa'; end if;
 if (select status from public.fin_approval_requests where id=(select value from handoff_ids where key='request')) <> 'approved'
 then raise exception 'cadeia de aprovação não concluiu'; end if;
 if has_function_privilege('authenticated','public.fin_notify_event()','EXECUTE')
 then raise exception 'gatilho de avisos exposto ao cliente'; end if;
end $$;

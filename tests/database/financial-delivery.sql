\set ON_ERROR_STOP on
-- Usa as organizações das fixtures de aprovação e colaboração (bb01 comprador,
-- bb02 provedor com convite aceito em bb11) e o contrato do teste de renovação.

-- ------------------------------------------------------------- respostas
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba01',false);
do $$
declare v_rfq uuid:='00000000-0000-4000-8000-00000000bb11';v_root uuid;v_reply uuid;
begin
 if has_table_privilege('authenticated','public.fin_comments','UPDATE') then raise exception 'comments became editable'; end if;
 v_root:=public.fin_add_comment('rfq',v_rfq,'internal','Raiz interna para thread',array[]::uuid[],'00000000-0000-4000-8000-00000000cd01');
 perform public.fin_add_comment('rfq',v_rfq,'provider_visible','Pergunta aberta aos provedores',array[]::uuid[],'00000000-0000-4000-8000-00000000cd02');
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba05',false);
do $$
declare v_reply uuid;
begin
 v_reply:=public.fin_reply_comment('00000000-0000-4000-8000-00000000cd01','Resposta interna',array[]::uuid[],'00000000-0000-4000-8000-00000000cd03');
 if (select parent_id from public.fin_comments where id=v_reply)<>'00000000-0000-4000-8000-00000000cd01' then raise exception 'reply not threaded'; end if;
 if (select visibility from public.fin_comments where id=v_reply)<>'internal' then raise exception 'reply changed visibility'; end if;
 if public.fin_reply_comment('00000000-0000-4000-8000-00000000cd01','Resposta interna',array[]::uuid[],'00000000-0000-4000-8000-00000000cd03')<>v_reply
 then raise exception 'reply replay not idempotent'; end if;
 begin
  perform public.fin_reply_comment('00000000-0000-4000-8000-00000000cd02','Outro pai, mesmo id',array[]::uuid[],'00000000-0000-4000-8000-00000000cd03');
  raise exception 'reply id reused for other parent';
 exception when others then if sqlerrm not like '%comment conflict%' then raise; end if; end;
 begin
  perform public.fin_reply_comment(v_reply,'Terceiro nível',array[]::uuid[],null);
  raise exception 'nested reply accepted';
 exception when others then if sqlerrm not like '%invalid parent%' then raise; end if; end;
end $$;
reset role;
do $$
begin
 if not exists(select 1 from public.fin_notifications where user_id='00000000-0000-4000-8000-00000000ba01' and event_type='comment'
   and event_id='00000000-0000-4000-8000-00000000cd03') then raise exception 'parent author not notified of reply'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba07',false);
do $$
declare v_reply uuid;
begin
 begin
  perform public.fin_reply_comment('00000000-0000-4000-8000-00000000cd01','Provedor respondendo interno',array[]::uuid[],null);
  raise exception 'provider replied to internal comment';
 exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
 v_reply:=public.fin_reply_comment('00000000-0000-4000-8000-00000000cd02','Resposta do provedor',array[]::uuid[],null);
 if (select visibility from public.fin_comments where id=v_reply)<>'provider_visible' then raise exception 'provider reply visibility'; end if;
 if exists(select 1 from public.fin_comments where id='00000000-0000-4000-8000-00000000cd03') then raise exception 'provider read internal reply'; end if;
end $$;

-- ------------------------------------------------------- e-mail de aviso
reset role;
update public.fin_settings set value='true' where key='email_enabled';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba04',false);
select public.fin_set_notification_preference('00000000-0000-4000-8000-00000000bb01','mention',true,true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba01',false);
do $$
declare i integer;
begin
 for i in 1..22 loop
  perform public.fin_add_comment('rfq','00000000-0000-4000-8000-00000000bb11','internal','Menção número '||i,
   array['00000000-0000-4000-8000-00000000ba04'::uuid,'00000000-0000-4000-8000-00000000ba05'::uuid],null);
 end loop;
end $$;
reset role;
do $$
declare v_row public.transactional_email_outbox%rowtype;v_count integer;
begin
 select count(*) into v_count from public.transactional_email_outbox where template='finance_notification'
  and recipient_address='approver-one@example.invalid';
 if v_count<>20 then raise exception 'notification e-mail rate limit not applied (%)',v_count; end if;
 if exists(select 1 from public.transactional_email_outbox where template='finance_notification'
  and recipient_address<>'approver-one@example.invalid') then raise exception 'e-mail sent without preference'; end if;
 if (select count(*) from public.fin_notifications where user_id='00000000-0000-4000-8000-00000000ba04' and event_type='mention'
   and body='Há um comentário para revisar.')<22 then raise exception 'in-app notification suppressed by e-mail limit'; end if;
 select * into v_row from public.transactional_email_outbox where template='finance_notification' limit 1;
 if (select array_agg(key order by key) from jsonb_object_keys(v_row.payload) key)<>array['event','kind','path'] then raise exception 'payload has extra fields'; end if;
 if v_row.payload::text ~* 'Aprovação empresarial|Menção|R\$|taxa' then raise exception 'payload leaked process content'; end if;
 if v_row.idempotency_key !~ '^notification:[0-9a-f-]{36}$' then raise exception 'idempotency key'; end if;
end $$;
update public.fin_settings set value='false' where key='email_enabled';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba01',false);
select public.fin_add_comment('rfq','00000000-0000-4000-8000-00000000bb11','internal','Com envio desligado',
 array['00000000-0000-4000-8000-00000000ba04'::uuid],'00000000-0000-4000-8000-00000000cd09');
reset role;
do $$
begin
 if (select count(*) from public.transactional_email_outbox where template='finance_notification')<>20 then raise exception 'e-mail queued while disabled'; end if;
 -- A outbox é compartilhada: não deixar linhas pendentes para o teste de concorrência.
 delete from public.transactional_email_outbox where template='finance_notification';
end $$;

-- ------------------------------------------------------ agenda de renovação
do $$
begin
 if has_function_privilege('authenticated','public.fin_run_renewal_schedule(date)','EXECUTE') then raise exception 'schedule callable by browser'; end if;
 if not has_function_privilege('service_role','public.fin_run_renewal_schedule(date)','EXECUTE') then raise exception 'schedule not callable by service role'; end if;
end $$;
-- Estado limpo para o contrato do teste de renovação (vence em 30 dias).
update public.fin_tasks set status='done' where related_type='contract';
delete from public.fin_renewal_milestones;
select set_config('request.jwt.claim.sub','',false);
create temporary table renewal_run(step text primary key, created integer, notifications integer);
select count(*) as notifications_before from public.fin_notifications where event_type='renewal_due' \gset
set role service_role;
select public.fin_run_renewal_schedule() as first_run \gset
select public.fin_run_renewal_schedule() as second_run \gset
reset role;
insert into renewal_run values ('first', :first_run, 0), ('second', :second_run, 0);
do $$
declare v_contract uuid;
begin
 select id into v_contract from public.fin_contracts where organization_id='00000000-0000-4000-8000-00000000bb01' order by created_at limit 1;
 if (select created from renewal_run where step='first')<>1 then raise exception 'scheduled renewal did not create task'; end if;
 if (select created from renewal_run where step='second')<>0 then raise exception 'scheduled renewal duplicated task'; end if;
 if (select milestone from public.fin_renewal_milestones where contract_id=v_contract)<>'d30' then raise exception 'wrong milestone'; end if;
 if (select count(*) from public.fin_tasks where related_id=v_contract and status='open')<>1 then raise exception 'open renewal tasks <> 1'; end if;
 if (select status from public.fin_contracts where id=v_contract)<>'renewing' then raise exception 'contract not moved to renewing'; end if;
 if (select created_by from public.fin_tasks where related_id=v_contract and status='open')<>(select owner_id from public.fin_contracts where id=v_contract)
 then raise exception 'scheduled task not attributed to contract owner'; end if;
 -- Aviso prévio igual ao marco de 30 dias: o aviso vence o empate e a tarefa aberta é reaproveitada.
 update public.fin_contracts set renewal_notice_days=30 where id=v_contract;
 delete from public.fin_renewal_milestones where contract_id=v_contract;
end $$;
select count(*) as notifications_mid from public.fin_notifications where event_type='renewal_due' \gset
set role service_role;
select public.fin_run_renewal_schedule() as third_run \gset
do $$
begin
 perform public.fin_run_renewal_schedule(current_date+10);
 raise exception 'arbitrary schedule date accepted';
exception when others then if sqlerrm not like '%invalid date%' then raise; end if;
end $$;
reset role;
insert into renewal_run values ('third', :third_run, :notifications_mid);
do $$
declare v_contract uuid;
begin
 select id into v_contract from public.fin_contracts where organization_id='00000000-0000-4000-8000-00000000bb01' order by created_at limit 1;
 if (select created from renewal_run where step='third')<>0 then raise exception 'reused task counted as new'; end if;
 if (select milestone from public.fin_renewal_milestones where contract_id=v_contract)<>'notice' then raise exception 'notice milestone not preferred'; end if;
 if (select count(*) from public.fin_tasks where related_id=v_contract and status='open')<>1 then raise exception 'second open task created'; end if;
 -- Marco novo avisa uma vez, mesmo reaproveitando a tarefa aberta
 -- (docs/supabase-financial-pilot-operations.sql).
 if (select count(*) from public.fin_notifications where event_type='renewal_due')<>(select notifications from renewal_run where step='third') + 1
 then raise exception 'new renewal milestone did not notify exactly once'; end if;
end $$;
select count(*) as notifications_after_third from public.fin_notifications where event_type='renewal_due' \gset
set role service_role;
select public.fin_run_renewal_schedule() as fourth_run \gset
reset role;
insert into renewal_run values ('fourth', :fourth_run, :notifications_after_third);
do $$ begin
 if (select count(*) from public.fin_notifications where event_type='renewal_due')<>(select notifications from renewal_run where step='fourth') then
   raise exception 'duplicate renewal notification';
 end if;
end $$;
reset role;
\echo 'Comment threads, preference-gated notification e-mail with rate limit and scheduled renewal milestones validated.'

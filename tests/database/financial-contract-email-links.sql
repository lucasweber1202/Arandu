\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values ('91000000-0000-4000-8000-000000000001','contract-email-91@example.invalid');
insert into public.fin_organizations(id,legal_name,kind,created_by) values ('91000000-0000-4000-8000-000000000010','Email 9.1 DEMO','BUYER','91000000-0000-4000-8000-000000000001');
insert into public.fin_members(organization_id,user_id,role) values ('91000000-0000-4000-8000-000000000010','91000000-0000-4000-8000-000000000001','admin');
insert into public.fin_notification_preferences(organization_id,user_id,event_type,in_app,email) values ('91000000-0000-4000-8000-000000000010','91000000-0000-4000-8000-000000000001','renewal_due',true,true);
update public.fin_settings set value='true' where key='email_enabled';
insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body) values
('91000000-0000-4000-8000-000000000010','91000000-0000-4000-8000-000000000001','renewal_due','contract','91000000-0000-4000-8000-000000000020','91000000-0000-4000-8000-000000000030','Renewal DEMO','Private terms must stay private');
do $$ declare p jsonb; begin
 select payload into strict p from public.transactional_email_outbox where idempotency_key in (select 'notification:'||id::text from public.fin_notifications where event_id='91000000-0000-4000-8000-000000000030');
 if p->>'path' is distinct from '/finance/contracts.html?abrir=contrato#contract-91000000-0000-4000-8000-000000000020' then raise exception 'canonical contract link missing: %',p; end if;
 if p::text ~ 'Private terms|DEMO' then raise exception 'notification leaked private content'; end if;
 if has_function_privilege('anon','public.fin_enqueue_notification_email()','EXECUTE') or has_function_privilege('authenticated','public.fin_enqueue_notification_email()','EXECUTE') then raise exception 'trigger function exposed'; end if;
end $$;
rollback;

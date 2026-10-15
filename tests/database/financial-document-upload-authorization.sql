\set ON_ERROR_STOP on
-- Fixtures independentes e inteiramente descartadas, inclusive no clean/upgrade.
begin;
insert into auth.users(id,email) values
('a1200000-0000-4000-8000-000000000001','upload-owner@example.invalid'),
('a1200000-0000-4000-8000-000000000002','upload-actor@example.invalid'),
('a1200000-0000-4000-8000-000000000003','upload-provider@example.invalid');
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('a1200000-0000-4000-8000-000000000010','Upload buyer synthetic','BUYER','a1200000-0000-4000-8000-000000000001'),
('a1200000-0000-4000-8000-000000000011','Upload provider synthetic','PROVIDER','a1200000-0000-4000-8000-000000000003');
insert into public.fin_members(organization_id,user_id,role) values
('a1200000-0000-4000-8000-000000000010','a1200000-0000-4000-8000-000000000001','admin'),
('a1200000-0000-4000-8000-000000000010','a1200000-0000-4000-8000-000000000002','analyst'),
('a1200000-0000-4000-8000-000000000011','a1200000-0000-4000-8000-000000000003','provider_user');
insert into public.fin_legal_entities(id,organization_id,legal_name,created_by) values
('a1200000-0000-4000-8000-000000000020','a1200000-0000-4000-8000-000000000010','Upload entity synthetic','a1200000-0000-4000-8000-000000000001');
insert into public.fin_rfqs(id,organization_id,legal_entity_id,product,title,status,owner_id,demand) values
('a1200000-0000-4000-8000-000000000030','a1200000-0000-4000-8000-000000000010','a1200000-0000-4000-8000-000000000020','credit','Upload synthetic','open','a1200000-0000-4000-8000-000000000001','{}');
create temp table ua_slots(key text primary key,document_id uuid);
grant all on ua_slots to authenticated,service_role;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1200000-0000-4000-8000-000000000002',true);
insert into ua_slots select 'buyer',document_id from public.fin_document_begin_upload('a1200000-0000-4000-8000-000000000010','rfq','a1200000-0000-4000-8000-000000000030','Buyer upload','internal','application/pdf',100);
-- A consulta legítima precisa continuar funcionando.
do $$ begin
 if not exists(select 1 from public.fin_document_pending_upload((select document_id from ua_slots where key='buyer'),1)) then raise exception 'authorized pending denied'; end if;
end $$;
reset role;
-- Reproduz primeiro o defeito original antes de conferir presença do helper.
delete from public.fin_members where organization_id='a1200000-0000-4000-8000-000000000010' and user_id='a1200000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin
 if exists(select 1 from public.fin_document_pending_upload((select document_id from ua_slots where key='buyer'),1)) then raise exception 'removed member retained pending upload access'; end if;
end $$;
reset role;
-- A finalização privilegiada deve conferir o ator persistido, sem auth.uid.
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
do $$ begin
 begin
  perform public.fin_document_finalize_upload((select document_id from ua_slots where key='buyer'),1,100,'application/pdf');
  raise exception 'removed member published upload';
 exception when others then if sqlerrm <> 'forbidden' then raise; end if; end;
end $$;
reset role;
insert into public.fin_members(organization_id,user_id,role) values ('a1200000-0000-4000-8000-000000000010','a1200000-0000-4000-8000-000000000002','viewer');
-- Permissão de leitura não concede publicação.
select set_config('request.jwt.claim.sub','a1200000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.fin_document_pending_upload((select document_id from ua_slots where key='buyer'),1)) then raise exception 'revoked authorization retained pending access'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role service_role;
do $$ begin
 begin perform public.fin_document_finalize_upload((select document_id from ua_slots where key='buyer'),1,100,'application/pdf'); raise exception 'viewer published upload';
 exception when others then if sqlerrm <> 'forbidden' then raise; end if; end;
end $$;
reset role;
update public.fin_members set role='analyst',entity_scope='entities' where organization_id='a1200000-0000-4000-8000-000000000010' and user_id='a1200000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub','a1200000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.fin_document_pending_upload((select document_id from ua_slots where key='buyer'),1)) then raise exception 'revoked authorization retained pending access'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role service_role;
do $$ begin
 begin perform public.fin_document_finalize_upload((select document_id from ua_slots where key='buyer'),1,100,'application/pdf'); raise exception 'scope revoked upload published';
 exception when others then if sqlerrm <> 'forbidden' then raise; end if; end;
end $$;
reset role;
insert into public.fin_member_entity_grants(organization_id,user_id,entity_id,granted_by) values ('a1200000-0000-4000-8000-000000000010','a1200000-0000-4000-8000-000000000002','a1200000-0000-4000-8000-000000000020','a1200000-0000-4000-8000-000000000001');
update public.fin_private_documents set removed_at=now(),removed_by='a1200000-0000-4000-8000-000000000001' where id=(select document_id from ua_slots where key='buyer');
select set_config('request.jwt.claim.sub','a1200000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.fin_document_pending_upload((select document_id from ua_slots where key='buyer'),1)) then raise exception 'revoked authorization retained pending access'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role service_role;
do $$ begin
 begin perform public.fin_document_finalize_upload((select document_id from ua_slots where key='buyer'),1,100,'application/pdf'); raise exception 'removed document published';
 exception when others then if sqlerrm <> 'forbidden' then raise; end if; end;
end $$;
reset role;
update public.fin_private_documents set removed_at=null,removed_by=null where id=(select document_id from ua_slots where key='buyer');
set local role service_role;
do $$ begin
 if auth.uid() is not null then raise exception 'service fixture retained user identity'; end if;
 if public.fin_document_finalize_upload((select document_id from ua_slots where key='buyer'),1,100,'application/pdf')<>'available' then raise exception 'valid scoped actor denied'; end if;
 if public.fin_document_finalize_upload((select document_id from ua_slots where key='buyer'),1,100,'application/pdf')<>'available' then raise exception 'publication replay failed'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.fin_events where entity_id='a1200000-0000-4000-8000-000000000030' and event_type='document_uploaded')<>1 then raise exception 'partial or duplicate events'; end if;
 if has_function_privilege('authenticated','public.fin_document_lock_upload_authorization(uuid,uuid)','execute')
 or has_function_privilege('service_role','public.fin_document_lock_upload_authorization(uuid,uuid)','execute')
 or has_function_privilege('anon','public.fin_document_lock_upload_authorization(uuid,uuid)','execute') then raise exception 'private actor helper exposed'; end if;
 if has_function_privilege('authenticated','public.fin_document_finalize_upload(uuid,integer,bigint,text)','execute') then raise exception 'browser can finalize'; end if;
end $$;
-- Provedor mantém apenas o próprio upload; rebaixamento retira publicação.
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
('a1200000-0000-4000-8000-000000000040','a1200000-0000-4000-8000-000000000010','Upload bank synthetic','bank','a1200000-0000-4000-8000-000000000001');
insert into public.fin_rfq_invites(id,buyer_organization_id,rfq_id,provider_id,provider_organization_id,token_hash,created_by,status,recipient_mode) values
('a1200000-0000-4000-8000-000000000041','a1200000-0000-4000-8000-000000000010','a1200000-0000-4000-8000-000000000030','a1200000-0000-4000-8000-000000000040','a1200000-0000-4000-8000-000000000011',repeat('a',64),'a1200000-0000-4000-8000-000000000001','accepted','organization_open');
insert into public.fin_proposals(id,invite_id,rfq_id,buyer_organization_id,provider_id,provider_organization_id,product) values
('a1200000-0000-4000-8000-000000000042','a1200000-0000-4000-8000-000000000041','a1200000-0000-4000-8000-000000000030','a1200000-0000-4000-8000-000000000010','a1200000-0000-4000-8000-000000000040','a1200000-0000-4000-8000-000000000011','credit');
select set_config('request.jwt.claim.sub','a1200000-0000-4000-8000-000000000003',true);
set local role authenticated;
insert into ua_slots select 'provider',document_id from public.fin_document_begin_upload('a1200000-0000-4000-8000-000000000011','proposal','a1200000-0000-4000-8000-000000000042','Provider upload','shared','application/pdf',100);
do $$ begin
 if not exists(select 1 from public.fin_document_pending_upload((select document_id from ua_slots where key='provider'),1)) then raise exception 'provider pending denied'; end if;
end $$;
reset role;
-- Outro usuário não ocupa a reserva, ainda que admin da compradora.
select set_config('request.jwt.claim.sub','a1200000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.fin_document_pending_upload((select document_id from ua_slots where key='provider'),1)) then raise exception 'buyer completed provider reservation'; end if;
end $$;
reset role;
update public.fin_members set role='viewer' where organization_id='a1200000-0000-4000-8000-000000000011' and user_id='a1200000-0000-4000-8000-000000000003';
select set_config('request.jwt.claim.sub','a1200000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.fin_document_pending_upload((select document_id from ua_slots where key='provider'),1)) then raise exception 'revoked provider pending allowed'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role service_role;
do $$ begin
 begin perform public.fin_document_finalize_upload((select document_id from ua_slots where key='provider'),1,100,'application/pdf'); raise exception 'revoked provider published';
 exception when others then if sqlerrm <> 'forbidden' then raise; end if; end;
end $$;
reset role;
update public.fin_members set role='provider_user' where organization_id='a1200000-0000-4000-8000-000000000011' and user_id='a1200000-0000-4000-8000-000000000003';
set local role service_role;
do $$ begin
 if public.fin_document_finalize_upload((select document_id from ua_slots where key='provider'),1,100,'application/pdf')<>'available' then raise exception 'provider publication denied'; end if;
end $$;
reset role;
rollback;

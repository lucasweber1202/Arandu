\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) select ('c3710000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'provider-intent-'||n||'@example.invalid' from generate_series(1,6) n;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('c3710000-0000-4000-8000-000000000010','Synthetic buyer','BUYER','c3710000-0000-4000-8000-000000000001'),
('c3710000-0000-4000-8000-000000000011','Synthetic other','BUYER','c3710000-0000-4000-8000-000000000004'),
('c3710000-0000-4000-8000-000000000012','Synthetic provider','PROVIDER','c3710000-0000-4000-8000-000000000005');
insert into public.fin_members(organization_id,user_id,role) values
('c3710000-0000-4000-8000-000000000010','c3710000-0000-4000-8000-000000000001','admin'),
('c3710000-0000-4000-8000-000000000010','c3710000-0000-4000-8000-000000000002','finance_manager'),
('c3710000-0000-4000-8000-000000000010','c3710000-0000-4000-8000-000000000003','analyst'),
('c3710000-0000-4000-8000-000000000011','c3710000-0000-4000-8000-000000000004','admin'),
('c3710000-0000-4000-8000-000000000012','c3710000-0000-4000-8000-000000000005','provider_user'),
('c3710000-0000-4000-8000-000000000010','c3710000-0000-4000-8000-000000000006','viewer');
create function pg_temp.denied(q text,expected text) returns void language plpgsql as $$ begin
 execute q; raise exception 'unexpected success';
 exception when others then if sqlerrm not like expected||'%' then raise exception 'expected %, got %',expected,sqlerrm; end if;
end $$;
grant execute on function pg_temp.denied(text,text) to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','c3710000-0000-4000-8000-000000000001',true);
create temporary table receipt(r jsonb);
insert into receipt select public.fin_create_provider_intent('c3710000-0000-4000-8000-000000000010','c3710000-0000-4000-8000-000000000050','{"name":" Banco Exemplo ","kind":"bank","contact_email":" Pessoa@Example.invalid "}');
do $$ declare x jsonb; begin
 x:=public.fin_create_provider_intent('c3710000-0000-4000-8000-000000000010','c3710000-0000-4000-8000-000000000050','{"contact_email":"pessoa@example.invalid","kind":"bank","name":"Banco Exemplo","products":[]}');
 if x->>'replayed'<>'true' or x->>'id'<>(select r->>'id' from receipt) then raise exception 'exact normalized replay'; end if;
 if x->'row'->>'provider_organization_id' is not null or x->'row'->>'verification_state'<>'NAO_VERIFICADO' then raise exception 'invented institutional identity'; end if;
 x:=public.fin_provider_creation_result('c3710000-0000-4000-8000-000000000010','c3710000-0000-4000-8000-000000000050');
 if x->>'state'<>'confirmed' or x->>'id'<>(select r->>'id' from receipt) then raise exception 'receipt identity'; end if;
 x:=public.fin_create_provider_intent('c3710000-0000-4000-8000-000000000010','c3710000-0000-4000-8000-000000000051','{"name":"Banco Exemplo","kind":"bank","contact_email":"pessoa@example.invalid"}');
 if x->>'id'=(select r->>'id' from receipt) then raise exception 'names merged distinct intentions'; end if;
end $$;
select pg_temp.denied($q$select public.fin_create_provider_intent('c3710000-0000-4000-8000-000000000010','c3710000-0000-4000-8000-000000000050','{"name":"Different","kind":"bank"}')$q$,'provider intent conflict');
select pg_temp.denied($q$select public.fin_create_provider_intent('c3710000-0000-4000-8000-000000000010',null,'{"name":"Malicious","kind":"bank","provider_organization_id":"c3710000-0000-4000-8000-000000000012"}')$q$,'invalid provider');
select pg_temp.denied($q$select public.fin_create_provider_intent('c3710000-0000-4000-8000-000000000010','malformed','{}')$q$,'invalid input syntax for type uuid');
select pg_temp.denied($q$update public.fin_providers set creation_request_hash=repeat('a',64) where id=((select r->>'id' from receipt)::uuid)$q$,'permission denied for table fin_providers');
select pg_temp.denied($q$insert into public.fin_providers(organization_id,name,kind,created_by,creation_request_key,creation_request_hash) values('c3710000-0000-4000-8000-000000000010','Forged','bank',auth.uid(),'c3710000-0000-4000-8000-000000000059',repeat('a',64))$q$,'permission denied for table fin_providers');
-- Legacy null-key POST retains creation behavior and audit, without claiming retry safety.
select public.fin_create_provider_intent('c3710000-0000-4000-8000-000000000010',null,'{"name":"Legacy","kind":"bank"}');
select set_config('request.jwt.claim.sub','c3710000-0000-4000-8000-000000000002',true);
do $$ begin
 if public.fin_provider_creation_result('c3710000-0000-4000-8000-000000000010','c3710000-0000-4000-8000-000000000050')->>'state'<>'unconfirmed' then raise exception 'another actor receipt leaked'; end if;
end $$;
select public.fin_create_provider_intent('c3710000-0000-4000-8000-000000000010','c3710000-0000-4000-8000-000000000050','{"name":"Manager counterpart","kind":"bank"}');
select set_config('request.jwt.claim.sub','c3710000-0000-4000-8000-000000000003',true);
select pg_temp.denied($q$select public.fin_create_provider_intent('c3710000-0000-4000-8000-000000000010',null,'{"name":"No","kind":"bank"}')$q$,'forbidden');
select set_config('request.jwt.claim.sub','c3710000-0000-4000-8000-000000000006',true);
select pg_temp.denied($q$select public.fin_create_provider_intent('c3710000-0000-4000-8000-000000000010',null,'{"name":"No","kind":"bank"}')$q$,'forbidden');
select set_config('request.jwt.claim.sub','c3710000-0000-4000-8000-000000000004',true);
select pg_temp.denied($q$select public.fin_provider_creation_result('c3710000-0000-4000-8000-000000000010','c3710000-0000-4000-8000-000000000050')$q$,'forbidden');
do $$ begin if exists(select 1 from public.fin_providers where organization_id='c3710000-0000-4000-8000-000000000010') then raise exception 'tenant RLS leak'; end if; end $$;
select set_config('request.jwt.claim.sub','c3710000-0000-4000-8000-000000000005',true);
select pg_temp.denied($q$select public.fin_create_provider_intent('c3710000-0000-4000-8000-000000000012',null,'{"name":"No","kind":"bank"}')$q$,'forbidden');
reset role;
select pg_temp.denied($q$update public.fin_providers set creation_request_hash=repeat('a',64) where id=((select r->>'id' from receipt)::uuid)$q$,'immutable provider receipt');
insert into public.fin_offboarding_requests(organization_id,status,reason,requested_by) values('c3710000-0000-4000-8000-000000000010','access_revocation','Synthetic offboarding test','c3710000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','c3710000-0000-4000-8000-000000000001',true);
select pg_temp.denied($q$select public.fin_create_provider_intent('c3710000-0000-4000-8000-000000000010',null,'{"name":"Blocked","kind":"bank"}')$q$,'organization offboarding');
select pg_temp.denied($q$select public.fin_provider_creation_result('c3710000-0000-4000-8000-000000000010','c3710000-0000-4000-8000-000000000050')$q$,'organization offboarding');
reset role;
delete from public.fin_offboarding_requests where organization_id='c3710000-0000-4000-8000-000000000010';
update auth.users set banned_until=now()+interval '1 day' where id='c3710000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.denied($q$select public.fin_provider_creation_result('c3710000-0000-4000-8000-000000000010','c3710000-0000-4000-8000-000000000050')$q$,'forbidden');
reset role;
update auth.users set banned_until=null where id='c3710000-0000-4000-8000-000000000001';
delete from public.fin_members where user_id='c3710000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','c3710000-0000-4000-8000-000000000001',true);
select pg_temp.denied($q$select public.fin_provider_creation_result('c3710000-0000-4000-8000-000000000010','c3710000-0000-4000-8000-000000000050')$q$,'forbidden');
reset role;
do $$ begin
 if (select count(*) from public.fin_events where organization_id='c3710000-0000-4000-8000-000000000010' and event_type='provider_created')<>4 then raise exception 'audit missing or replay duplicated'; end if;
 if not exists(select 1 from pg_class where oid='public.fin_providers'::regclass and relrowsecurity and relforcerowsecurity) then raise exception 'RLS/FORCE required'; end if;
 if has_function_privilege('anon','public.fin_create_provider_intent(uuid,uuid,jsonb)','execute') or has_function_privilege('service_role','public.fin_provider_creation_result(uuid,uuid)','execute') or has_function_privilege('authenticated','public.fin_provider_intent_actor(uuid,boolean)','execute') then raise exception 'excess grant'; end if;
end $$;
rollback;

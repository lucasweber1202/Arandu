\set ON_ERROR_STOP on
create or replace function pg_temp.expect_error(p_sql text,p_message text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error % for %',p_message,p_sql;
exception when others then
  if sqlerrm not like p_message||'%' then raise; end if;
end $$;
grant execute on function pg_temp.expect_error(text,text) to authenticated;

do $$ begin
  if (select value from public.fin_settings where key='schema_version') <> 'financial-task-accountability-1' then
    raise exception 'task accountability schema marker mismatch';
  end if;
  if (select title from public.fin_tasks where id='00000000-0000-4000-8000-0000000bd001') <> 'Título histórico preservado'
     or exists(select 1 from public.fin_tasks where id='00000000-0000-4000-8000-0000000bd001' and (assignee_id is not null or assignee_source is not null)) then
    raise exception 'legacy task title or unassigned state changed';
  end if;
  if (select legal_entity_id from public.fin_tasks where id='00000000-0000-4000-8000-0000000bd003') <> '00000000-0000-4000-8000-0000000bc002'::uuid then
    raise exception 'related task entity was not derived before assignee validation';
  end if;
  if has_function_privilege('authenticated','public.fin_task_assignee_guard()','EXECUTE')
     or has_function_privilege('anon','public.fin_task_assignee_guard()','EXECUTE') then
    raise exception 'internal assignee trigger exposed';
  end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and tablename='fin_tasks'
       and indexname='fin_tasks_idempotency_key_idx') then raise exception 'task idempotency unique index missing'; end if;
  if not exists(select 1 from pg_constraint where conrelid='public.fin_tasks'::regclass
       and conname='fin_tasks_assignee_member_fk' and confdeltype='n') then
    raise exception 'membership deletion must SET NULL on the assignee FK';
  end if;
end $$;

-- Authorized assignment and direct caller-JWT PATCH contract.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ba001',false);
update public.fin_tasks set assignee_id='00000000-0000-4000-8000-0000000ba002',assignee_source='manual'
 where id='00000000-0000-4000-8000-0000000bd001';
update public.fin_tasks set assignee_id='00000000-0000-4000-8000-0000000ba003',assignee_source='manual'
 where id='00000000-0000-4000-8000-0000000bd003';
select pg_temp.expect_error($q$update public.fin_tasks set assignee_id='00000000-0000-4000-8000-0000000ba002',assignee_source='manual' where id='00000000-0000-4000-8000-0000000bd003'$q$,'invalid task assignee');
insert into public.fin_tasks(id,organization_id,title,status,related_type,related_id,created_by,assignee_id,assignee_source)
values('00000000-0000-4000-8000-0000000bd004','00000000-0000-4000-8000-0000000bb001','Derived entity assignment','open','rfq','00000000-0000-4000-8000-0000000be001','00000000-0000-4000-8000-0000000ba001','00000000-0000-4000-8000-0000000ba003','manual');
insert into public.fin_tasks(id,organization_id,title,status,related_type,related_id,created_by,assignee_id,assignee_source,idempotency_key,idempotency_hash)
values('00000000-0000-4000-8000-0000000bd006','00000000-0000-4000-8000-0000000bb001','Idempotent task','open','rfq','00000000-0000-4000-8000-0000000be001','00000000-0000-4000-8000-0000000ba001','00000000-0000-4000-8000-0000000ba003','manual','00000000-0000-0000-0000-000000000001',encode(sha256(convert_to('payload','UTF8')),'hex'))
on conflict(organization_id,created_by,idempotency_key) do nothing;
insert into public.fin_tasks(id,organization_id,title,status,related_type,related_id,created_by,assignee_id,assignee_source,idempotency_key,idempotency_hash)
values('00000000-0000-4000-8000-0000000bd007','00000000-0000-4000-8000-0000000bb001','Idempotent task','open','rfq','00000000-0000-4000-8000-0000000be001','00000000-0000-4000-8000-0000000ba001','00000000-0000-4000-8000-0000000ba003','manual','00000000-0000-0000-0000-000000000001',encode(sha256(convert_to('payload','UTF8')),'hex'))
on conflict(organization_id,created_by,idempotency_key) do nothing;
do $$ begin
  if (select count(*) from public.fin_tasks where idempotency_key='00000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'task idempotency retry created a duplicate';
  end if;
  if (select count(*) from public.fin_events where entity_id='00000000-0000-4000-8000-0000000bd006' and event_type='task_assignee_changed') <> 1 then
    raise exception 'task idempotency retry duplicated assignment audit';
  end if;
end $$;
do $$ begin
  if (select legal_entity_id from public.fin_tasks where id='00000000-0000-4000-8000-0000000bd004') <> '00000000-0000-4000-8000-0000000bc002'::uuid then
    raise exception 'insert assignment did not use the derived source entity';
  end if;
end $$;
do $$ begin
  if not exists(select 1 from public.fin_events e where e.entity_type='task'
    and e.entity_id='00000000-0000-4000-8000-0000000bd001' and e.event_type='task_assignee_changed'
    and e.actor_id='00000000-0000-4000-8000-0000000ba001'
    and e.metadata->>'new_assignee_id'='00000000-0000-4000-8000-0000000ba002') then
    raise exception 'human assignee change missing from audit trail';
  end if;
end $$;
select pg_temp.expect_error($q$update public.fin_tasks set assignee_id='00000000-0000-4000-8000-0000000ba005',assignee_source='manual' where id='00000000-0000-4000-8000-0000000bd001'$q$,'invalid task assignee');
select pg_temp.expect_error($q$update public.fin_tasks set assignee_id='00000000-0000-4000-8000-0000000ba004',assignee_source='manual' where id='00000000-0000-4000-8000-0000000bd001'$q$,'invalid task assignee');
select pg_temp.expect_error($q$update public.fin_tasks set assignee_id='00000000-0000-4000-8000-0000000ba003',assignee_source='manual' where id='00000000-0000-4000-8000-0000000bd001'$q$,'invalid task assignee');

-- A task assignee has no ability to assign tasks or reach a different entity.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ba002',false);
select pg_temp.expect_error($q$update public.fin_tasks set assignee_id='00000000-0000-4000-8000-0000000ba003',assignee_source='manual' where id='00000000-0000-4000-8000-0000000bd001'$q$,'forbidden');
update public.fin_tasks set status='done' where id='00000000-0000-4000-8000-0000000bd001';
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ba001',false);
update public.fin_tasks set assignee_id='00000000-0000-4000-8000-0000000ba005',assignee_source='inherited'
 where id='00000000-0000-4000-8000-0000000bd001';
do $$ begin
  if (select assignee_id from public.fin_tasks where id='00000000-0000-4000-8000-0000000bd001') <> '00000000-0000-4000-8000-0000000ba002'::uuid
     or (select assignee_source from public.fin_tasks where id='00000000-0000-4000-8000-0000000bd001') <> 'manual' then
    raise exception 'inherited sync overwrote human task assignment';
  end if;
end $$;
reset role;

-- Membership role downgrade makes the target ineligible for future assignment.
update public.fin_members set role='viewer'
 where organization_id='00000000-0000-4000-8000-0000000bb001' and user_id='00000000-0000-4000-8000-0000000ba002';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ba001',false);
select pg_temp.expect_error($q$update public.fin_tasks set assignee_id='00000000-0000-4000-8000-0000000ba002',assignee_source='manual' where id='00000000-0000-4000-8000-0000000bd001'$q$,'invalid task assignee');
reset role;
update public.fin_members set role='analyst'
 where organization_id='00000000-0000-4000-8000-0000000bb001' and user_id='00000000-0000-4000-8000-0000000ba002';

-- No inherited source is enabled in this migration. Manual assignments and
-- explicit manual clears remain authoritative over attempted sync writes.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ba001',false);
update public.fin_tasks set assignee_id=null,assignee_source='manual'
 where id='00000000-0000-4000-8000-0000000bd001';
reset role;
select set_config('request.jwt.claim.sub','',false);
select set_config('request.jwt.claim.role','',false);
update public.fin_tasks set assignee_id='00000000-0000-4000-8000-0000000ba002',assignee_source='inherited'
 where id='00000000-0000-4000-8000-0000000bd001';
do $$ begin
  if exists(select 1 from public.fin_tasks where id='00000000-0000-4000-8000-0000000bd001' and (assignee_id is not null or assignee_source <> 'manual')) then
    raise exception 'inherited sync replaced a manual unassignment';
  end if;
end $$;
select set_config('request.jwt.claim.role','service_role',false);
select set_config('arandu.task_assignee_sync','trusted',false);
select pg_temp.expect_error($q$update public.fin_tasks set assignee_id='00000000-0000-4000-8000-0000000ba002',assignee_source='inherited' where id='00000000-0000-4000-8000-0000000bd005'$q$,'forbidden');
select set_config('request.jwt.claim.role','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ba001',false);
update public.fin_tasks set assignee_id='00000000-0000-4000-8000-0000000ba003',assignee_source='manual'
 where id='00000000-0000-4000-8000-0000000bd002';
reset role;
select set_config('request.jwt.claim.sub','',false);
select set_config('request.jwt.claim.role','service_role',false);
select set_config('arandu.task_assignee_sync','trusted',false);
update public.fin_tasks set assignee_id='00000000-0000-4000-8000-0000000ba002',assignee_source='inherited'
 where id='00000000-0000-4000-8000-0000000bd002';
do $$ begin
  if (select assignee_id from public.fin_tasks where id='00000000-0000-4000-8000-0000000bd002') <> '00000000-0000-4000-8000-0000000ba003'::uuid then
    raise exception 'inherited retry overwrote human assignment';
  end if;
end $$;
select set_config('request.jwt.claim.sub','',false);
select set_config('request.jwt.claim.role','',false);

-- The assignee still cannot read a task outside their entity (assignment is
-- accountability only and does not widen RLS access).
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ba002',false);
do $$ begin
  if exists(select 1 from public.fin_tasks where id='00000000-0000-4000-8000-0000000bd002') then
    raise exception 'task assignment widened entity RLS visibility';
  end if;
end $$;
reset role;

-- Removing an entity grant clears stale responsibility without granting the
-- assignee cross-entity access or deleting any task content.
delete from public.fin_member_entity_grants
 where organization_id='00000000-0000-4000-8000-0000000bb001'
   and user_id='00000000-0000-4000-8000-0000000ba003'
   and entity_id='00000000-0000-4000-8000-0000000bc002';
do $$ begin
  if exists(select 1 from public.fin_tasks where id='00000000-0000-4000-8000-0000000bd002' and assignee_id is not null) then
    raise exception 'entity-scope revocation left a stale assignee';
  end if;
end $$;

-- Deleting a member removes their assignment while retaining task and title.
delete from public.fin_members
 where organization_id='00000000-0000-4000-8000-0000000bb001' and user_id='00000000-0000-4000-8000-0000000ba003';
do $$ begin
  if exists(select 1 from public.fin_tasks where id='00000000-0000-4000-8000-0000000bd002' and assignee_id is not null)
     or (select title from public.fin_tasks where id='00000000-0000-4000-8000-0000000bd002') <> 'Tarefa entidade B' then
    raise exception 'membership removal did not clear only the assignee';
  end if;
end $$;

-- The FK removal path remains fail-safe inside an authenticated offboarding
-- transaction: the lock blocks new assignment but cannot block revocation.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ba005',false);
update public.fin_tasks set assignee_id='00000000-0000-4000-8000-0000000ba006',assignee_source='manual'
 where id='00000000-0000-4000-8000-0000000bd005';
reset role;
insert into public.fin_offboarding_requests(id,organization_id,status,reason,requested_by)
values('00000000-0000-4000-8000-0000000bf001','00000000-0000-4000-8000-0000000bb002','access_revocation','Synthetic task assignment offboarding lock','00000000-0000-4000-8000-0000000ba005');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ba005',false);
delete from public.fin_members where organization_id='00000000-0000-4000-8000-0000000bb002'
  and user_id='00000000-0000-4000-8000-0000000ba006';
do $$ begin
  if exists(select 1 from public.fin_tasks where id='00000000-0000-4000-8000-0000000bd005' and assignee_id is not null)
     or (select title from public.fin_tasks where id='00000000-0000-4000-8000-0000000bd005') <> 'Tarefa sob lock de offboarding' then
    raise exception 'offboarding lock prevented member assignment cleanup';
  end if;
end $$;

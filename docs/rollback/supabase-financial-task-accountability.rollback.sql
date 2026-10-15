-- Rollback conservador: uma vez usada a responsabilidade persistida, prefira
-- forward-fix; o rollback só prossegue quando não há dados de atribuição.
begin;
do $$ begin
  if exists(select 1 from public.fin_tasks where assignee_id is not null or assignee_source is not null) then
    raise exception 'task assignment data exists: use forward fix';
  end if;
end $$;

drop trigger if exists fin_tasks_z_assignee_guard on public.fin_tasks;
drop trigger if exists fin_tasks_entity_guard on public.fin_tasks;
create trigger fin_task_entity_guard
  before insert or update on public.fin_tasks
  for each row execute function public.fin_task_entity_guard();
drop trigger if exists fin_members_task_assignee_guard on public.fin_members;
drop trigger if exists fin_member_entity_grants_task_assignee_guard on public.fin_member_entity_grants;
drop function if exists public.fin_task_clear_invalid_assignee();
drop function if exists public.fin_task_assignee_guard();
drop function if exists public.fin_task_actor_can_assign(uuid,uuid,uuid);
drop function if exists public.fin_task_assignee_member_valid(uuid,uuid,uuid);
drop index if exists public.fin_tasks_assignee_idx;
alter table public.fin_tasks drop constraint if exists fin_tasks_assignee_member_fk;
alter table public.fin_tasks drop constraint if exists fin_tasks_assignee_source_consistency;
alter table public.fin_tasks drop constraint if exists fin_tasks_assignee_source_check;
alter table public.fin_tasks drop column if exists assignee_source;
alter table public.fin_tasks drop column if exists assignee_id;
update public.fin_settings set value='financial-implementation-task-labels-1', updated_at=now()
 where key='schema_version' and value='financial-task-accountability-1';
commit;

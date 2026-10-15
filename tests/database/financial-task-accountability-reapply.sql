\set ON_ERROR_STOP on
do $$ begin
  if (select value from public.fin_settings where key='schema_version') <> 'financial-task-accountability-1' then
    raise exception 'reapplied task accountability marker mismatch';
  end if;
  if (select title from public.fin_tasks where id='00000000-0000-4000-8000-0000000bd001') <> 'Título histórico preservado'
     or exists(select 1 from public.fin_tasks where id::text like '00000000-0000-4000-8000-0000000bd00%' and assignee_id is not null) then
    raise exception 'reapplying changed preserved task data or restored removed members';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.fin_tasks'::regclass and tgname='fin_tasks_entity_guard' and not tgisinternal)
     or not exists(select 1 from pg_trigger where tgrelid='public.fin_tasks'::regclass and tgname='fin_tasks_z_assignee_guard' and not tgisinternal) then
    raise exception 'task entity/assignee trigger order setup missing';
  end if;
end $$;

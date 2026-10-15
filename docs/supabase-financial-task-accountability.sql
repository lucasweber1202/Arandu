-- Atribuição persistida de tarefas financeiras.
-- A identidade é uma membership ativa em fin_members; a atribuição não concede
-- acesso ao objeto financeiro relacionado nem a documentos.
-- Este migration não infere owners de related_type='contract': renovação,
-- covenant/obrigação e implantação compartilham esse vínculo. Nenhuma origem
-- herda automaticamente neste contrato. A origem inherited fica reservada a
-- um sync futuro, source-specific e service-only, protegido pelo GUC interno.
-- Reexecução segura; nenhum título ou estado histórico é reescrito.
begin;

alter table public.fin_tasks
  add column if not exists assignee_id uuid,
  add column if not exists assignee_source text;

alter table public.fin_tasks drop constraint if exists fin_tasks_assignee_source_check;
alter table public.fin_tasks add constraint fin_tasks_assignee_source_check
  check (assignee_source is null or assignee_source in ('manual','inherited'));
alter table public.fin_tasks drop constraint if exists fin_tasks_assignee_source_consistency;
alter table public.fin_tasks add constraint fin_tasks_assignee_source_consistency
  check ((assignee_id is null or assignee_source is not null)
     and (assignee_source is distinct from 'inherited' or assignee_id is not null));

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.fin_tasks'::regclass
       and conname = 'fin_tasks_assignee_member_fk'
  ) then
    -- PostgreSQL 15+ supports a column list for SET NULL. Keep organization_id
    -- intact while membership removal clears only the assignee identity.
    alter table public.fin_tasks add constraint fin_tasks_assignee_member_fk
      foreign key (organization_id, assignee_id)
      references public.fin_members(organization_id, user_id)
      on delete set null (assignee_id);
  end if;
end $$;

create index if not exists fin_tasks_assignee_idx
  on public.fin_tasks(organization_id, assignee_id, status)
  where assignee_id is not null;

create or replace function public.fin_task_assignee_member_valid(p_org uuid,p_entity uuid,p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_member public.fin_members%rowtype;
begin
  select m.* into v_member from public.fin_members m
   where m.organization_id=p_org and m.user_id=p_user
   for share;
  if not found or v_member.role not in ('admin','finance_manager','analyst') then return false; end if;
  if v_member.entity_scope='group' then return true; end if;
  if p_entity is null then return false; end if;
  perform 1
    from public.fin_legal_entities e
    join public.fin_member_entity_grants g
      on g.organization_id=e.organization_id and g.user_id=p_user
     and (g.entity_id=e.id or g.entity_id=e.parent_id)
   where e.organization_id=p_org and e.id=p_entity
   for key share of g;
  return found;
end
$$;
revoke all on function public.fin_task_assignee_member_valid(uuid,uuid,uuid) from public,anon,authenticated;

create or replace function public.fin_task_actor_can_assign(p_org uuid,p_entity uuid,p_actor uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_role text;
begin
  select m.role into v_role from public.fin_members m
   where m.organization_id=p_org and m.user_id=p_actor
   for share;
  if not found or v_role not in ('admin','finance_manager') then return false; end if;
  return public.fin_task_assignee_member_valid(p_org,p_entity,p_actor);
end
$$;
revoke all on function public.fin_task_actor_can_assign(uuid,uuid,uuid) from public,anon,authenticated;

create or replace function public.fin_task_assignee_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_can_assign boolean := false;
  v_changed boolean;
  v_assignment_changed boolean;
begin
  v_changed := tg_op = 'INSERT'
    and (new.assignee_id is not null or new.assignee_source is not null);
  if tg_op = 'UPDATE' then
    v_assignment_changed := new.assignee_id is distinct from old.assignee_id
      or new.assignee_source is distinct from old.assignee_source;
    v_changed := new.assignee_id is distinct from old.assignee_id
      or new.assignee_source is distinct from old.assignee_source
      or new.organization_id is distinct from old.organization_id
      or new.legal_entity_id is distinct from old.legal_entity_id;

    -- A human decision (including an explicit unassignment) is authoritative.
    -- Automatic synchronization must not replace it.
    if old.assignee_source = 'manual' and new.assignee_source = 'inherited' then
      new.assignee_id := old.assignee_id;
      new.assignee_source := old.assignee_source;
      if new.organization_id is not distinct from old.organization_id
         and new.legal_entity_id is not distinct from old.legal_entity_id then
        return new;
      end if;
    end if;
  end if;
  if not v_changed then return new; end if;

  -- The only identity-free UPDATE permitted is the FK action that clears an
  -- assignee after their membership row has been removed.
  if new.assignee_id is null and tg_op = 'UPDATE' and old.assignee_id is not null
     and not exists (
       select 1 from public.fin_members m
        where m.organization_id = old.organization_id and m.user_id = old.assignee_id
     ) then
    if old.assignee_source='inherited' then new.assignee_source := null; end if;
    insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,legal_entity_id,metadata)
    values(new.organization_id,'task',new.id,'task_assignee_cleared',v_actor,new.legal_entity_id,
      jsonb_build_object('task_id',new.id,'previous_assignee_id',old.assignee_id,
        'new_assignee_id',null,'reason','membership_removed'));
    return new;
  end if;

  if new.assignee_source = 'inherited' and (
       v_actor is not null or auth.role() is distinct from 'service_role'
       or current_setting('arandu.task_assignee_sync',true) is distinct from 'trusted'
  ) then
    -- No identity-free writes are accepted by default. A future service-only
    -- sync function must set this transaction-local guard after validating its
    -- source record; auth.uid() NULL alone is not sufficient authority.
    raise exception 'forbidden';
  end if;

  if v_actor is not null then
    if v_assignment_changed or tg_op='INSERT' and (new.assignee_id is not null or new.assignee_source is not null) then
      if new.assignee_source = 'manual' then
        null;
      elsif new.assignee_id is null and new.assignee_source is null
         and current_setting('arandu.task_assignee_cleanup',true) = 'trusted' then
        return new;
      else
        raise exception 'forbidden';
      end if;
    end if;
    if (new.assignee_id is not null or new.assignee_source = 'manual')
       and current_setting('arandu.task_assignee_cleanup',true) is distinct from 'trusted' then
      v_can_assign := public.fin_task_actor_can_assign(new.organization_id,new.legal_entity_id,v_actor);
      if not v_can_assign then raise exception 'forbidden'; end if;
      if public.fin_governance_org_locked(new.organization_id) then
        raise exception 'organization offboarding';
      end if;
    end if;
  elsif new.assignee_id is null and current_setting('arandu.task_assignee_cleanup',true) = 'trusted' then
    return new;
  elsif new.assignee_source = 'manual' then
    -- System identities may inherit, but may not forge a human decision.
    raise exception 'forbidden';
  end if;

  if new.assignee_id is not null then
    if not public.fin_task_assignee_member_valid(new.organization_id,new.legal_entity_id,new.assignee_id) then
      raise exception 'invalid task assignee';
    end if;
    if new.assignee_source is null then raise exception 'invalid task assignee'; end if;
  end if;

  if v_actor is not null and (tg_op='INSERT' or old.assignee_id is distinct from new.assignee_id
      or old.assignee_source is distinct from new.assignee_source)
     and current_setting('arandu.task_assignee_cleanup',true) is distinct from 'trusted' then
    insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,legal_entity_id,metadata)
    values(new.organization_id,'task',new.id,'task_assignee_changed',v_actor,new.legal_entity_id,
      jsonb_build_object('task_id',new.id,'previous_assignee_id',case when tg_op='INSERT' then null else old.assignee_id end,
        'new_assignee_id',new.assignee_id,'source','manual'));
  end if;
  if new.assignee_id is null then return new; end if;
  return new;
end
$$;
revoke all on function public.fin_task_assignee_guard() from public, anon, authenticated;

create or replace function public.fin_task_clear_invalid_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare r record;
begin
  for r in select t.id,t.organization_id,t.legal_entity_id,t.assignee_id,t.assignee_source
             from public.fin_tasks t
            where t.organization_id=old.organization_id and t.assignee_id=old.user_id
            for update
  loop
    if not public.fin_task_assignee_member_valid(r.organization_id,r.legal_entity_id,r.assignee_id) then
      -- A revoked member/scope cannot retain an assignment. This transaction-
      -- local marker permits only this trigger to clear inherited provenance.
      perform set_config('arandu.task_assignee_cleanup','trusted',true);
      update public.fin_tasks set assignee_id=null,
        assignee_source=case when assignee_source='inherited' then null else assignee_source end
       where id=r.id;
      insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,legal_entity_id,metadata)
      values(r.organization_id,'task',r.id,'task_assignee_cleared',auth.uid(),r.legal_entity_id,
        jsonb_build_object('task_id',r.id,'previous_assignee_id',r.assignee_id,
          'new_assignee_id',null,'reason','membership_scope_changed'));
      perform set_config('arandu.task_assignee_cleanup','',true);
    end if;
  end loop;
  return null;
end
$$;
revoke all on function public.fin_task_clear_invalid_assignee() from public,anon,authenticated;

drop trigger if exists fin_members_task_assignee_guard on public.fin_members;
create trigger fin_members_task_assignee_guard
  after update of role,entity_scope on public.fin_members
  for each row execute function public.fin_task_clear_invalid_assignee();
drop trigger if exists fin_member_entity_grants_task_assignee_guard on public.fin_member_entity_grants;
create trigger fin_member_entity_grants_task_assignee_guard
  after delete or update on public.fin_member_entity_grants
  for each row execute function public.fin_task_clear_invalid_assignee();

-- Multi-entity's `fin_task_entity_guard` derives legal_entity_id first; this
-- lexical trigger name ensures our validation sees that final scope.
drop trigger if exists fin_task_entity_guard on public.fin_tasks;
drop trigger if exists fin_tasks_entity_guard on public.fin_tasks;
create trigger fin_tasks_entity_guard
  before insert or update on public.fin_tasks
  for each row execute function public.fin_task_entity_guard();
drop trigger if exists fin_tasks_z_assignee_guard on public.fin_tasks;
create trigger fin_tasks_z_assignee_guard
  before insert or update on public.fin_tasks
  for each row execute function public.fin_task_assignee_guard();

insert into public.fin_settings(key, value)
values ('schema_version', 'financial-task-accountability-1')
on conflict (key) do update set value = excluded.value, updated_at = now();

commit;

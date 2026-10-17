-- Authorization must still hold at the material write, after table/row waits.
-- v2's version checks and the internal decision implementation stay intact.
begin;
create or replace function public.fin_decision_live_actor_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_role text; v_entity uuid;
begin
  select role into v_role from public.fin_members
    where organization_id=new.organization_id and user_id=auth.uid() for share;
  if not found or v_role not in ('admin','finance_manager') or new.decided_by is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;
  perform 1 from public.fin_member_entity_grants
    where organization_id=new.organization_id and user_id=auth.uid() for share;
  select legal_entity_id into v_entity from public.fin_rfqs where id=new.rfq_id and organization_id=new.organization_id;
  if not found or not public.fin_entity_visible(new.organization_id,v_entity) then raise exception 'forbidden'; end if;
  return new;
end $$;
revoke all on function public.fin_decision_live_actor_guard() from public,anon,authenticated,service_role;
drop trigger if exists fin_decisions_live_actor on public.fin_decisions;
create trigger fin_decisions_live_actor before insert on public.fin_decisions
  for each row execute function public.fin_decision_live_actor_guard();
insert into public.fin_settings(key,value) values('schema_version', 'financial-decision-authorization-1')
on conflict(key) do update set value=excluded.value,updated_at=now();
commit;

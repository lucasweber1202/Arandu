-- Close the unversioned client entry point. v2 remains SECURITY DEFINER and
-- calls this function internally as its owner; no decision/history is changed.
begin;

revoke all on function public.fin_record_decision(uuid, uuid, jsonb, text)
  from public, anon, authenticated, service_role;
do $$ begin
  if not (select has_function_privilege(p.proowner,
      'public.fin_record_decision(uuid,uuid,jsonb,text)'::regprocedure,'EXECUTE')
      from pg_proc p where p.oid='public.fin_record_decision_v2(uuid,uuid,integer,jsonb,text)'::regprocedure) then
    raise exception 'versioned decision owner cannot call internal implementation';
  end if;
end $$;

-- Recheck authorization at the actual vote write, holding it through commit.
-- RPC checks alone precede row-lock waits and can become stale during the wait.
create or replace function public.fin_approval_live_actor_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_entity uuid; v_role text; v_stage public.fin_approval_stages%rowtype;
begin
  if old.status <> 'pending' or new.status not in ('approved','rejected','changes_requested')
    or old.status = new.status then return new; end if;
  select a.organization_id,r.legal_entity_id into v_org,v_entity
    from public.fin_approval_requests a join public.fin_rfqs r on r.id=a.rfq_id where a.id=new.request_id;
  select m.role into v_role from public.fin_members m
    where m.organization_id=v_org and m.user_id=auth.uid() for share;
  if not found or v_role not in ('admin','finance_manager','analyst','viewer') or new.acted_by is distinct from auth.uid() then raise exception 'forbidden'; end if;
  perform 1 from public.fin_member_entity_grants g where g.organization_id=v_org and g.user_id=auth.uid() for share;
  if not public.fin_entity_visible(v_org,v_entity) then raise exception 'forbidden'; end if;
  if new.stage_id is not null then
    select * into v_stage from public.fin_approval_stages where id=new.stage_id;
    if not public.fin_approval_member_eligible(v_org,v_entity,auth.uid(),v_stage.roles,v_stage.scope) then raise exception 'forbidden'; end if;
  end if;
  return new;
end $$;
revoke all on function public.fin_approval_live_actor_guard() from public,anon,authenticated,service_role;
drop trigger if exists fin_approval_steps_live_actor on public.fin_approval_steps;
create trigger fin_approval_steps_live_actor before update on public.fin_approval_steps
  for each row execute function public.fin_approval_live_actor_guard();

-- Minimal provider-facing buyer identity, derived only from accepted invitations.
-- No SELECT grant on buyer organizations, and no privileged fallback in the API.
create or replace function public.fin_assignment_buyer_names(p_org uuid, p_rfqs uuid[])
returns table(rfq_id uuid, buyer_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.fin_has_role(p_org) or not exists (
    select 1 from public.fin_organizations o where o.id=p_org and o.kind='PROVIDER'
  ) then raise exception 'forbidden'; end if;
  if coalesce(cardinality(p_rfqs),0) > 200 then raise exception 'invalid assignment filters'; end if;
  return query
    select distinct r.id, coalesce(nullif(trim(o.trade_name),''), o.legal_name)
      from public.fin_rfqs r
      join public.fin_organizations o on o.id=r.organization_id
      join public.fin_rfq_invites i on i.rfq_id=r.id and i.buyer_organization_id=r.organization_id
        and i.provider_organization_id=p_org and i.status='accepted'
      join public.fin_proposals p on p.invite_id=i.id and p.rfq_id=r.id and p.provider_organization_id=p_org
     where r.id=any(p_rfqs);
end $$;
revoke all on function public.fin_assignment_buyer_names(uuid, uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.fin_assignment_buyer_names(uuid, uuid[]) to authenticated, service_role;

insert into public.fin_settings(key,value) values('schema_version', 'financial-enterprise-integrity-1')
on conflict(key) do update set value=excluded.value,updated_at=now();
commit;

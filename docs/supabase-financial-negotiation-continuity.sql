-- Preserve version provenance in the existing canonical origin event.
-- No backfill: historical events never acquire an invented originating version.
begin;
create or replace function public.fin_stamp_contract_rfq_origin()
returns trigger language plpgsql security definer set search_path='' as $$
declare c public.fin_contracts%rowtype; r public.fin_rfqs%rowtype; v_origin_version integer;
begin
  if new.event_type <> 'rfq_created_from_contract' then return new; end if;
  select * into c from public.fin_contracts where id=(new.metadata->>'contract_id')::uuid for share;
  select * into r from public.fin_rfqs where id=new.entity_id;
  if c.id is null or r.id is null or new.entity_type<>'rfq'
    or c.organization_id<>new.organization_id or r.organization_id<>c.organization_id
    or c.legal_entity_id is distinct from r.legal_entity_id
    or not public.fin_entity_allows(c.organization_id,c.legal_entity_id,array['admin','finance_manager'])
  then raise exception 'forbidden'; end if;
  select version into v_origin_version from public.fin_contract_versions
    where contract_id=c.id and effective_from<=current_date order by effective_from desc,version desc limit 1;
  new.metadata := new.metadata || jsonb_build_object('contract_id',c.id,'contract_version',v_origin_version,'origin_schema','contract-rfq-v2');
  return new;
end $$;
revoke all on function public.fin_stamp_contract_rfq_origin() from public,anon,authenticated,service_role;
drop trigger if exists fin_contract_rfq_origin on public.fin_events;
create trigger fin_contract_rfq_origin before insert on public.fin_events
for each row when (new.event_type='rfq_created_from_contract') execute function public.fin_stamp_contract_rfq_origin();
create index if not exists fin_contract_rfq_origin_lookup on public.fin_events(organization_id,(metadata->>'contract_id'),id)
where entity_type='rfq' and event_type='rfq_created_from_contract';
-- A human explicitly closes review with an existing decision, in one transaction.
create or replace function public.fin_complete_opportunity_negotiation(p_id uuid,p_expected text,p_decision uuid,p_confirmed boolean,p_resolution text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.fin_opportunities%rowtype; d public.fin_decisions%rowtype;
begin
 select * into o from public.fin_opportunities where id=p_id for update;
 if o.id is null or auth.uid() is null then raise exception 'forbidden'; end if;
 perform public.fin_contract_import_actor(o.organization_id,o.legal_entity_id,array['admin','finance_manager']);
 if p_expected is null or p_expected not in ('acknowledged','under_review') or p_confirmed is not true or length(trim(coalesce(p_resolution,''))) not between 3 and 1000 or p_resolution ~ '[<>]' then raise exception 'opportunity result confirmation required'; end if;
 select * into d from public.fin_decisions where id=p_decision and organization_id=o.organization_id and rfq_id=o.linked_rfq_id;
 if d.id is null or not public.fin_rfq_visible(d.rfq_id) then raise exception 'opportunity result unavailable'; end if;
 if o.status='acted' and o.resolution=trim(p_resolution) and exists(select 1 from public.fin_events where organization_id=o.organization_id and entity_type='opportunity' and entity_id=o.id and event_type='opportunity_negotiation_completed' and metadata->>'decision_id'=d.id::text) then
   return jsonb_build_object('status','acted','decision_id',d.id,'replayed',true);
 end if;
 perform public.fin_transition_opportunity(o.id,p_expected,jsonb_build_object('to_status','acted','resolution',p_resolution));
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
 values(o.organization_id,'opportunity',o.id,'opportunity_negotiation_completed',auth.uid(),jsonb_build_object('rfq_id',d.rfq_id,'decision_id',d.id));
 return jsonb_build_object('status','acted','decision_id',d.id,'replayed',false);
end $$;
revoke all on function public.fin_complete_opportunity_negotiation(uuid,text,uuid,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.fin_complete_opportunity_negotiation(uuid,text,uuid,boolean,text) to authenticated;
insert into public.fin_settings(key,value) values ('schema_version', 'financial-negotiation-continuity-1')
on conflict(key) do update set value=excluded.value,updated_at=now();
notify pgrst,'reload schema';
commit;

-- Destructive rollback for isolated validation only. Preserve approval evidence in pilot/production.
create or replace function public.fin_record_decision(
  p_rfq uuid, p_proposal uuid, p_criteria jsonb default '{}'::jsonb, p_rationale text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_status text; v_snapshot jsonb; v_id uuid; v_version integer;
begin
  select organization_id, status into v_org, v_status from public.fin_rfqs where id = p_rfq for update;
  if v_org is null then raise exception 'rfq not found'; end if;
  if not public.fin_has_role(v_org, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if v_status not in ('collecting','comparing') then raise exception 'invalid state'; end if;
  if jsonb_typeof(coalesce(p_criteria,'null'::jsonb)) is distinct from 'object' then raise exception 'invalid criteria'; end if;
  if exists (select 1 from public.fin_decisions d where d.rfq_id = p_rfq) then raise exception 'decision already recorded'; end if;

  select p.current_version into v_version from public.fin_proposals p
    where p.id = p_proposal and p.rfq_id = p_rfq and p.buyer_organization_id = v_org
      and p.status in ('submitted','revised');
  if v_version is null then raise exception 'proposal not eligible'; end if;

  select jsonb_build_object(
    'decided_proposal_id', p_proposal,
    'decided_version', v_version,
    'captured_at', now(),
    'proposals', coalesce(jsonb_agg(jsonb_build_object(
      'proposal_id', p.id, 'provider_id', p.provider_id, 'status', p.status,
      'version', p.current_version, 'terms', v.terms, 'submitted_at', v.submitted_at
    ) order by p.created_at), '[]'::jsonb)
  ) into v_snapshot
  from public.fin_proposals p
  left join public.fin_proposal_versions v on v.proposal_id = p.id and v.version = p.current_version
  where p.rfq_id = p_rfq and p.buyer_organization_id = v_org and p.current_version > 0;

  insert into public.fin_decisions (organization_id, rfq_id, proposal_id, decided_by, criteria, rationale, snapshot)
    values (v_org, p_rfq, p_proposal, auth.uid(), coalesce(p_criteria,'{}'::jsonb), p_rationale, v_snapshot)
    returning id into v_id;
  update public.fin_rfqs set status = 'decided', updated_at = now() where id = p_rfq;
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v_org, 'rfq', p_rfq, 'decision_recorded', auth.uid(), jsonb_build_object('decided_version', v_version));
  return v_id;
end $$;
drop table if exists public.fin_approval_steps;
drop table if exists public.fin_approval_requests;
drop function if exists public.fin_cancel_approval(uuid);
drop function if exists public.fin_act_on_approval(uuid,text,text);
drop function if exists public.fin_request_approval(uuid,uuid,uuid[],text);

drop function if exists public.fin_set_approval_policy(uuid,boolean);
drop table if exists public.fin_approval_policies;

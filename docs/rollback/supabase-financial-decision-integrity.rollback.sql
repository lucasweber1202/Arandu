-- Rollback de docs/supabase-financial-decision-integrity.sql: volta o envio de
-- proposta à ordem de locks anterior (proposta, depois RFQ) e remove
-- fin_record_decision_v2. A API volta a chamar fin_record_decision sem versão
-- esperada (o código da aplicação precisa ser revertido junto). Decisões já
-- gravadas não mudam.
begin;

drop function if exists public.fin_record_decision_v2(uuid, uuid, integer, jsonb, text);

create or replace function public.fin_submit_proposal(p_proposal uuid, p_terms jsonb, p_note text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_row public.fin_proposals%rowtype; v_rfq_status text; v_version integer; v_current jsonb;
begin
  if jsonb_typeof(coalesce(p_terms,'null'::jsonb)) is distinct from 'object' then raise exception 'invalid terms'; end if;
  select * into v_row from public.fin_proposals where id = p_proposal for update;
  if not found then raise exception 'proposal not found'; end if;
  if not public.fin_has_role(v_row.provider_organization_id, array['admin','provider_user']) then raise exception 'forbidden'; end if;
  if v_row.status = 'withdrawn' then raise exception 'invalid state'; end if;
  select status into v_rfq_status from public.fin_rfqs where id = v_row.rfq_id;
  if v_rfq_status not in ('open','collecting') then raise exception 'rfq is not receiving proposals'; end if;

  if v_row.current_version > 0 then
    select terms into v_current from public.fin_proposal_versions
      where proposal_id = p_proposal and version = v_row.current_version;
    if v_current = p_terms then return v_row.current_version; end if;
  end if;

  v_version := v_row.current_version + 1;
  insert into public.fin_proposal_versions (proposal_id, version, terms, note, submitted_by)
    values (p_proposal, v_version, p_terms, p_note, auth.uid());
  update public.fin_proposals
    set current_version = v_version,
        status = case when v_version = 1 then 'submitted' else 'revised' end,
        updated_at = now()
    where id = p_proposal;
  update public.fin_rfqs set status = 'collecting', updated_at = now()
    where id = v_row.rfq_id and status = 'open';
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v_row.buyer_organization_id, 'proposal', p_proposal,
            case when v_version = 1 then 'proposal_submitted' else 'proposal_revised' end,
            auth.uid(), jsonb_build_object('version', v_version));
  return v_version;
end $$;

revoke all on function public.fin_submit_proposal(uuid, jsonb, text) from public, anon;
grant execute on function public.fin_submit_proposal(uuid, jsonb, text) to authenticated, service_role;

insert into public.fin_settings (key, value) values ('schema_version', 'financial-renewal-cycles-1')
on conflict (key) do update set value = excluded.value, updated_at = now();

commit;

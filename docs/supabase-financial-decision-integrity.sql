-- Integridade da decisão (Stage 0, R3 de docs/QA_ADVERSARIAL_2026-10-14.md).
--
-- 1. Decisão sobre versão que o comprador não viu (D2). fin_record_decision
--    grava a versão corrente da proposta no momento do commit. Se o provedor
--    revisou a proposta depois de o comprador abrir a comparação, a decisão era
--    gravada na versão nova, com condições que o comprador nunca viu (sem
--    política de aprovação nada barrava; com política, a aprovação vinculada à
--    versão antiga barrava). fin_record_decision_v2 recebe a versão exibida e
--    recusa ("proposal version changed") quando ela já não é a corrente.
-- 2. Deadlock envio × decisão (R3). O envio travava a proposta e só depois a
--    RFQ (gatilho da versão, FOR SHARE); a decisão trava a RFQ e depois a
--    proposta (FK de fin_decisions). Na janela entre a leitura do status e a
--    gravação, os dois se bloqueavam e o Postgres abortava o envio com
--    "deadlock detected" (reproduzido; o estado final ficava íntegro). Agora o
--    envio trava a RFQ primeiro, na mesma ordem da decisão, e lê o status já
--    travado: quem chega depois espera e vê o estado final do outro.
--
-- Mesmas assinaturas; função nova só acrescentada. Aditiva e idempotente.
-- Rollback em docs/rollback/supabase-financial-decision-integrity.rollback.sql.
begin;

create or replace function public.fin_submit_proposal(p_proposal uuid, p_terms jsonb, p_note text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_row public.fin_proposals%rowtype; v_rfq uuid; v_rfq_status text; v_version integer; v_current jsonb;
begin
  if jsonb_typeof(coalesce(p_terms,'null'::jsonb)) is distinct from 'object' then raise exception 'invalid terms'; end if;
  -- Mesma ordem de locks da decisão (RFQ antes da proposta): sem deadlock entre
  -- envio e decisão, e o status da RFQ é lido já travado. NO KEY UPDATE porque
  -- o envio pode mover a RFQ para "collecting", sem bloquear FKs que a referenciam.
  select p.rfq_id into v_rfq from public.fin_proposals p where p.id = p_proposal;
  if v_rfq is null then raise exception 'proposal not found'; end if;
  select status into v_rfq_status from public.fin_rfqs where id = v_rfq for no key update;
  select * into v_row from public.fin_proposals where id = p_proposal for update;
  if not found or v_row.rfq_id is distinct from v_rfq then raise exception 'proposal not found'; end if;
  if not public.fin_has_role(v_row.provider_organization_id, array['admin','provider_user']) then raise exception 'forbidden'; end if;
  if v_row.status = 'withdrawn' then raise exception 'invalid state'; end if;
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

create or replace function public.fin_record_decision_v2(
  p_rfq uuid, p_proposal uuid, p_expected_version integer,
  p_criteria jsonb default '{}'::jsonb, p_rationale text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_version integer;
begin
  if p_expected_version is null or p_expected_version < 1 then raise exception 'invalid expected version'; end if;
  -- A RFQ travada impede envio concorrente (o envio trava a RFQ antes da proposta):
  -- a versão lida aqui é a que a decisão vai gravar.
  select organization_id into v_org from public.fin_rfqs where id = p_rfq for update;
  if v_org is null then raise exception 'rfq not found'; end if;
  if not public.fin_has_role(v_org, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  select current_version into v_version from public.fin_proposals
    where id = p_proposal and rfq_id = p_rfq and buyer_organization_id = v_org;
  if v_version is null then raise exception 'proposal not eligible'; end if;
  if v_version <> p_expected_version then raise exception 'proposal version changed'; end if;
  return public.fin_record_decision(p_rfq, p_proposal, p_criteria, p_rationale);
end $$;

revoke all on function public.fin_submit_proposal(uuid, jsonb, text) from public, anon;
grant execute on function public.fin_submit_proposal(uuid, jsonb, text) to authenticated, service_role;
revoke all on function public.fin_record_decision_v2(uuid, uuid, integer, jsonb, text) from public, anon;
grant execute on function public.fin_record_decision_v2(uuid, uuid, integer, jsonb, text) to authenticated, service_role;

insert into public.fin_settings (key, value) values ('schema_version', 'financial-decision-integrity-1')
on conflict (key) do update set value = excluded.value, updated_at = now();

commit;

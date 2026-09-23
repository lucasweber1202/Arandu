-- Arandu — Financial Procurement, endurecimento para piloto.
--
-- Migration ADITIVA sobre docs/supabase-financial-procurement.sql. Não remove
-- nem renomeia nada; substitui funções por versões mais restritas e acrescenta
-- as travas de integridade que faltavam.
--
-- Corrige três problemas de integridade encontrados na auditoria da main:
--   P1-1  uma RFQ podia acumular mais de uma decisão (nada impedia duas
--         decisões concorrentes sobre propostas diferentes da mesma RFQ);
--   P1-2  uma decisão podia gerar mais de um contrato;
--   P1-3  `fin_record_decision` e `fin_register_contract` não travavam a linha
--         que liam, então duas requisições simultâneas passavam as duas pela
--         checagem de estado.

-- ------------------------------------------------- travas de unicidade

-- Uma RFQ tem no máximo uma decisão. O índice é a garantia real; o `for update`
-- adiante evita que a segunda requisição só descubra isso no erro.
create unique index if not exists fin_decisions_one_per_rfq on public.fin_decisions (rfq_id);

-- Uma decisão gera no máximo um contrato.
create unique index if not exists fin_contracts_one_per_decision on public.fin_contracts (decision_id);

-- ------------------------------------------- completar dados da organização

-- Sem isto a organização nascia apenas com a razão social e nunca podia ser
-- completada: `fin_organizations` não tem UPDATE para `authenticated`, e não
-- havia função para preencher CNPJ, setor ou porte. O onboarding real ficava
-- impossível de concluir.
--
-- O CNPJ é validado em formato e dígitos pela aplicação (lib/finance/cnpj.mjs)
-- e aqui apenas no formato armazenado. O banco NÃO afirma que a empresa existe.
create or replace function public.fin_update_organization(
  p_org uuid, p_trade_name text default null, p_tax_identifier text default null,
  p_sector text default null, p_revenue_band text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.fin_has_role(p_org, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if p_tax_identifier is not null and p_tax_identifier !~ '^[0-9]{14}$' then raise exception 'invalid tax identifier'; end if;
  if p_revenue_band is not null and p_revenue_band not in ('ate_360k','360k_4_8m','4_8m_30m','30m_300m','acima_300m') then
    raise exception 'invalid revenue band';
  end if;
  update public.fin_organizations
    set trade_name = coalesce(nullif(trim(coalesce(p_trade_name,'')),''), trade_name),
        tax_identifier = coalesce(p_tax_identifier, tax_identifier),
        sector = coalesce(nullif(trim(coalesce(p_sector,'')),''), sector),
        revenue_band = coalesce(p_revenue_band, revenue_band)
    where id = p_org;
  if not found then raise exception 'not found'; end if;
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id)
    values (p_org, 'organization', p_org, 'organization_updated', auth.uid());
end $$;

-- ------------------------------------- evidência regulatória de provedor

-- O estado verificado exige as quatro evidências ao mesmo tempo — a constraint
-- da tabela já recusa o contrário, e esta função é o único caminho de escrita.
-- Ela registra que uma evidência foi INFORMADA, com fonte e data. Ela não
-- afirma que o provedor é regulado, aprovado, seguro ou recomendado.
create or replace function public.fin_record_provider_evidence(
  p_provider uuid, p_authority text, p_registry text, p_evidence_url text, p_checked_at date
) returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.fin_providers where id = p_provider;
  if v_org is null then raise exception 'not found'; end if;
  if not public.fin_has_role(v_org, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if coalesce(p_evidence_url,'') !~ '^https://' then raise exception 'evidence url must use https'; end if;
  if length(trim(coalesce(p_authority,''))) < 2 or length(trim(coalesce(p_registry,''))) < 1 then
    raise exception 'authority and registry are required';
  end if;
  if p_checked_at is null or p_checked_at > current_date then raise exception 'invalid check date'; end if;
  update public.fin_providers
    set verification_state = 'EVIDENCIA_REGISTRADA', regulator_authority = trim(p_authority),
        regulator_registry = trim(p_registry), regulator_evidence_url = p_evidence_url,
        regulator_checked_at = p_checked_at, updated_at = now()
    where id = p_provider;
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id)
    values (v_org, 'provider', p_provider, 'provider_evidence_recorded', auth.uid());
end $$;

-- ------------------------------------------------ edição da demanda da RFQ

-- Editar a demanda depois de a RFQ estar aberta muda o enunciado debaixo de
-- provedores que já leram os requisitos. Continua permitido (o comprador pode
-- corrigir um erro), mas agora deixa rastro: o evento nomeia que houve mudança
-- após a abertura, e a trilha permite reconstruir o que cada provedor viu.
create or replace function public.fin_update_rfq_demand(
  p_rfq uuid, p_title text, p_description text, p_demand jsonb, p_deadline date default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_status text;
begin
  if jsonb_typeof(coalesce(p_demand,'null'::jsonb)) is distinct from 'object' then raise exception 'invalid demand'; end if;
  select organization_id, status into v_org, v_status from public.fin_rfqs where id = p_rfq for update;
  if v_org is null then raise exception 'not found'; end if;
  if not public.fin_has_role(v_org, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if v_status not in ('draft','open') then raise exception 'invalid state'; end if;
  update public.fin_rfqs
    set title = coalesce(nullif(trim(coalesce(p_title,'')),''), title),
        description = p_description, demand = p_demand, response_deadline = p_deadline, updated_at = now()
    where id = p_rfq;
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v_org, 'rfq', p_rfq,
            case when v_status = 'open' then 'rfq_demand_updated_after_open' else 'rfq_demand_updated' end,
            auth.uid(), jsonb_build_object('status', v_status));
end $$;

-- ------------------------------------------------------ envio de proposta

-- Acrescenta idempotência: reenviar exatamente os mesmos termos (duplo clique,
-- retry de rede) devolve a versão atual em vez de criar uma versão nova
-- idêntica, que poluiria o histórico e faria a proposta parecer revisada.
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

-- ---------------------------------------------------------- decisão humana

-- Mudanças: trava a RFQ com `for update` (duas decisões simultâneas passavam
-- as duas pela checagem de estado) e registra explicitamente a VERSÃO da
-- proposta escolhida no snapshot. Uma revisão posterior do provedor não altera
-- a fotografia: o snapshot é um jsonb gravado neste instante.
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

-- ------------------------------------------------------------- contrato

-- Trava a decisão, recusa contrato duplicado e cria a tarefa derivada de
-- revisão de renovação — a tabela `fin_tasks` existia sem nenhum caminho que a
-- alimentasse.
create or replace function public.fin_register_contract(
  p_decision uuid, p_starts date, p_ends date, p_notice integer default 60,
  p_cost text default null, p_conditions text default null, p_reference text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_dec public.fin_decisions%rowtype; v_provider uuid; v_product text; v_id uuid; v_review date;
begin
  select * into v_dec from public.fin_decisions where id = p_decision for update;
  if not found then raise exception 'decision not found'; end if;
  if not public.fin_has_role(v_dec.organization_id, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if exists (select 1 from public.fin_contracts c where c.decision_id = p_decision) then raise exception 'contract already registered'; end if;
  if p_ends < p_starts then raise exception 'invalid period'; end if;
  select p.provider_id, p.product into v_provider, v_product from public.fin_proposals p where p.id = v_dec.proposal_id;
  insert into public.fin_contracts (organization_id, decision_id, proposal_id, provider_id, product,
      starts_on, ends_on, renewal_notice_days, cost_summary, main_conditions, document_reference, owner_id)
    values (v_dec.organization_id, p_decision, v_dec.proposal_id, v_provider, v_product,
      p_starts, p_ends, coalesce(p_notice,60), p_cost, p_conditions, p_reference, auth.uid())
    returning id into v_id;
  update public.fin_rfqs set status = 'contracted', updated_at = now()
    where id = v_dec.rfq_id and status = 'decided';
  v_review := p_ends - coalesce(p_notice,60);
  insert into public.fin_tasks (organization_id, title, due_on, related_type, related_id, created_by)
    values (v_dec.organization_id,
            'Revisar renovação do contrato antes do aviso prévio', v_review, 'contract', v_id, auth.uid());
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v_dec.organization_id, 'contract', v_id, 'contract_registered', auth.uid(),
            jsonb_build_object('review_from', v_review));
  return v_id;
end $$;

revoke all on function
  public.fin_update_organization(uuid, text, text, text, text),
  public.fin_record_provider_evidence(uuid, text, text, text, date)
  from public, anon;
grant execute on function
  public.fin_update_organization(uuid, text, text, text, text),
  public.fin_record_provider_evidence(uuid, text, text, text, date)
  to authenticated, service_role;

-- A tarefa derivada é criada pela função acima, que roda como definer. O
-- cliente continua podendo criar e fechar as próprias tarefas pelas policies
-- já existentes.

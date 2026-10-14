-- Contrato existente: do registro à próxima ação (14/10/2026).
--
-- A empresa que chega ao Arandu com contratos já assinados registra cada um
-- por fin_import_contract. Até aqui esse caminho divergia do contrato nascido
-- de uma decisão (fin_register_contract) e deixava a jornada sem continuidade:
--
-- 1. Sem próxima ação. O contrato registrado por decisão já nasce com a tarefa
--    "Revisar renovação"; o importado não, e só ganhava tarefa quando a agenda
--    diária o alcançasse (até 90 dias do fim). Agora o importado nasce com a
--    mesma tarefa, com prazo no início do aviso prévio (fim − aviso). Quando
--    esse prazo já passou, a tarefa vence hoje e o contrato entra em
--    renovação ("renewing"), como a agenda faria. A agenda reaproveita a tarefa
--    aberta (fin_run_renewal_schedule), então não há tarefa duplicada.
-- 2. Contrato já encerrado. Um contrato cujo fim já passou é registro
--    histórico (memória institucional): não ganha tarefa de renovação no
--    registro. O status segue o modelo atual (nenhum caminho grava "expired";
--    a agenda trata o vencido como hoje).
-- 3. Duplicação. Duplo envio ou reenvio depois de erro de rede criava dois
--    contratos idênticos. O mesmo provedor, categoria, título (sem diferença de
--    caixa/espaços), início e fim na mesma organização passam a ser recusados
--    ("contract duplicate"); a contagem é serializada por organização.
-- 4. Contrato principal incoerente. O contrato filho (aditivo comercial,
--    pacote de serviços) podia apontar para um principal de outro provedor ou
--    de outra entidade jurídica. Agora o principal precisa ser do mesmo
--    provedor e, quando pertence a uma entidade, o filho fica nessa entidade.
-- 5. Moeda divergente. A moeda informada e a moeda dos termos estruturados
--    podiam discordar em silêncio (prevalecia a informada). Agora a
--    divergência é recusada ("currency mismatch").
--
-- 6. Renovação iniciada duas vezes. "Iniciar nova concorrência" anunciava que o
--    contrato passava para "Em renovação", mas fin_start_contract_rfq não mudava
--    o status: o botão continuava ali e cada clique criava outro rascunho. Agora
--    o contrato vigente passa a "renewing" e, enquanto houver concorrência de
--    renovação em andamento a partir dele, a função devolve essa mesma
--    concorrência em vez de criar outra.
--
-- Mesmas assinaturas, mesmas concessões; aditiva e idempotente; não altera dado
-- existente. Rollback em docs/rollback/supabase-financial-contract-onboarding.rollback.sql.
begin;

create index if not exists idx_fin_contracts_import_identity
  on public.fin_contracts(organization_id, provider_id, product, starts_on, ends_on);
create index if not exists idx_fin_events_rfq_from_contract
  on public.fin_events(organization_id, (metadata->>'contract_id')) where event_type = 'rfq_created_from_contract';

create or replace function public.fin_import_contract(
  p_org uuid, p_entity uuid, p_provider uuid, p_product text, p_title text,
  p_starts date, p_ends date, p_notice integer default 60, p_auto_renew boolean default false,
  p_currency text default null, p_terms jsonb default '{}'::jsonb, p_parent uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_currency text; v_parent record; v_notice integer; v_review date; v_status text; v_task uuid;
begin
  if not public.fin_entity_allows(p_org, p_entity, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.fin_organizations o where o.id = p_org and o.kind = 'BUYER') then raise exception 'buyer organization required'; end if;
  if p_entity is not null and not exists (select 1 from public.fin_legal_entities e where e.organization_id = p_org and e.id = p_entity and e.status = 'active') then
    raise exception 'invalid legal entity';
  end if;
  if not exists (select 1 from public.fin_providers p where p.organization_id = p_org and p.id = p_provider) then raise exception 'provider not found'; end if;
  if p_starts is null or p_ends is null or p_ends < p_starts then raise exception 'invalid period'; end if;
  if p_notice is not null and p_notice not between 0 and 3650 then raise exception 'invalid period'; end if;
  if p_terms is null or not public.fin_valid_contract_terms(p_terms) then raise exception 'invalid contract terms'; end if;
  if p_currency is not null and p_terms ? 'currency' and upper(p_currency) is distinct from upper(p_terms->>'currency') then
    raise exception 'currency mismatch';
  end if;
  if p_parent is not null then
    select c.id, c.provider_id, c.legal_entity_id into v_parent from public.fin_contracts c
     where c.organization_id = p_org and c.id = p_parent and public.fin_entity_visible(p_org, c.legal_entity_id);
    if not found then raise exception 'contract not found'; end if;
    if v_parent.provider_id is distinct from p_provider then raise exception 'invalid parent contract'; end if;
    if v_parent.legal_entity_id is not null and p_entity is distinct from v_parent.legal_entity_id then raise exception 'invalid parent contract'; end if;
  end if;
  -- Duplo envio concorrente: a checagem e a inserção ficam serializadas por organização.
  perform pg_advisory_xact_lock(hashtext('fin_import_contract'), hashtext(p_org::text));
  if exists (select 1 from public.fin_contracts c where c.organization_id = p_org and c.provider_id = p_provider
       and c.product = p_product and c.starts_on = p_starts and c.ends_on = p_ends
       and lower(btrim(coalesce(c.title, ''))) = lower(btrim(p_title))) then
    raise exception 'contract duplicate';
  end if;
  v_currency := coalesce(upper(p_currency), p_terms->>'currency',
    (select e.currency from public.fin_legal_entities e where e.id = p_entity),
    (select o.base_currency from public.fin_organizations o where o.id = p_org));
  v_notice := coalesce(p_notice, 60);
  v_review := p_ends - v_notice;
  v_status := case when p_ends >= current_date and v_review <= current_date then 'renewing' else 'active' end;
  insert into public.fin_contracts(organization_id, provider_id, product, starts_on, ends_on, renewal_notice_days, auto_renew,
      owner_id, origin, title, currency, parent_contract_id, legal_entity_id, current_version, terms_updated_at, status)
    values (p_org, p_provider, p_product, p_starts, p_ends, v_notice, coalesce(p_auto_renew, false),
      auth.uid(), 'imported', trim(p_title), v_currency, p_parent, p_entity, 1, now(), v_status)
    returning id into v_id;
  insert into public.fin_contract_versions(contract_id, organization_id, version, effective_from, source, terms, recorded_by)
    values (v_id, p_org, 1, p_starts, 'import', p_terms, auth.uid());
  -- Mesma próxima ação do contrato registrado por decisão; encerrado não tem.
  if p_ends >= current_date then
    insert into public.fin_tasks(organization_id, title, due_on, status, related_type, related_id, created_by)
      values (p_org, 'Revisar renovação do contrato antes do aviso prévio', greatest(v_review, current_date), 'open', 'contract', v_id, auth.uid())
      returning id into v_task;
  end if;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (p_org, 'contract', v_id, 'contract_imported', auth.uid(),
      jsonb_build_object('product', p_product, 'terms_fields', (select count(*) from jsonb_object_keys(p_terms)), 'has_parent', p_parent is not null,
        'status', v_status, 'review_from', case when v_task is null then null else greatest(v_review, current_date) end, 'task_id', v_task));
  return v_id;
exception when check_violation then raise exception 'invalid contract';
end $$;

revoke all on function public.fin_import_contract(uuid, uuid, uuid, text, text, date, date, integer, boolean, text, jsonb, uuid) from public, anon;
grant execute on function public.fin_import_contract(uuid, uuid, uuid, text, text, date, date, integer, boolean, text, jsonb, uuid) to authenticated, service_role;

create or replace function public.fin_start_contract_rfq(p_contract uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c record; v_id uuid; v_title text;
begin
  select ct.organization_id, ct.product, ct.id, ct.legal_entity_id, ct.origin, ct.status ct_status, ct.title ct_title, r.title, r.description, r.demand into c
    from public.fin_contracts ct
    left join public.fin_decisions d on d.id = ct.decision_id
    left join public.fin_rfqs r on r.id = d.rfq_id and r.organization_id = ct.organization_id
   where ct.id = p_contract for update of ct;
  if not found then raise exception 'contract not found'; end if;
  if not public.fin_entity_allows(c.organization_id, c.legal_entity_id, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if c.product not in ('credit','acquiring') then raise exception 'invalid product'; end if;
  -- Concorrência de renovação ainda em andamento: devolve a mesma.
  select r.id into v_id from public.fin_events e
    join public.fin_rfqs r on r.id = e.entity_id and r.organization_id = c.organization_id
   where e.organization_id = c.organization_id and e.entity_type = 'rfq' and e.event_type = 'rfq_created_from_contract'
     and e.metadata->>'contract_id' = c.id::text and r.status in ('draft','open','collecting','comparing','decided')
   order by e.happened_at desc limit 1;
  if v_id is not null then return v_id; end if;
  v_title := left('Renovação: ' || coalesce(c.title, c.ct_title, 'contrato existente'), 200);
  insert into public.fin_rfqs(organization_id, product, title, description, demand, owner_id, status, legal_entity_id)
    values (c.organization_id, c.product, v_title, c.description, coalesce(c.demand, '{}'::jsonb), auth.uid(), 'draft', c.legal_entity_id)
    returning id into v_id;
  if c.ct_status = 'active' then
    update public.fin_contracts set status = 'renewing', updated_at = now() where id = c.id;
  end if;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (c.organization_id, 'contract', c.id, 'renewal_rfq_started', auth.uid(), jsonb_build_object('rfq_id', v_id));
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (c.organization_id, 'rfq', v_id, 'rfq_created_from_contract', auth.uid(), jsonb_build_object('contract_id', c.id));
  return v_id;
end $$;

revoke all on function public.fin_start_contract_rfq(uuid) from public, anon;
grant execute on function public.fin_start_contract_rfq(uuid) to authenticated, service_role;

insert into public.fin_settings (key, value) values ('schema_version', 'financial-contract-onboarding-1')
on conflict (key) do update set value = excluded.value, updated_at = now();

commit;

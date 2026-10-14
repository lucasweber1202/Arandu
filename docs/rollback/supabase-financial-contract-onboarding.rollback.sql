-- Rollback de docs/supabase-financial-contract-onboarding.sql: restaura a
-- definição anterior de fin_import_contract (contracts v2), sem tarefa inicial,
-- sem recusa de duplicado e sem coerência de contrato principal ou moeda; e
-- fin_start_contract_rfq sem reaproveitar a concorrência em andamento.
-- Contratos já importados, suas tarefas e status permanecem como estão.
begin;

drop index if exists public.idx_fin_contracts_import_identity;
drop index if exists public.idx_fin_events_rfq_from_contract;

create or replace function public.fin_import_contract(
  p_org uuid, p_entity uuid, p_provider uuid, p_product text, p_title text,
  p_starts date, p_ends date, p_notice integer default 60, p_auto_renew boolean default false,
  p_currency text default null, p_terms jsonb default '{}'::jsonb, p_parent uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_currency text;
begin
  if not public.fin_entity_allows(p_org, p_entity, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.fin_organizations o where o.id = p_org and o.kind = 'BUYER') then raise exception 'buyer organization required'; end if;
  if p_entity is not null and not exists (select 1 from public.fin_legal_entities e where e.organization_id = p_org and e.id = p_entity and e.status = 'active') then
    raise exception 'invalid legal entity';
  end if;
  if not exists (select 1 from public.fin_providers p where p.organization_id = p_org and p.id = p_provider) then raise exception 'provider not found'; end if;
  if p_starts is null or p_ends is null or p_ends < p_starts then raise exception 'invalid period'; end if;
  if p_terms is null or not public.fin_valid_contract_terms(p_terms) then raise exception 'invalid contract terms'; end if;
  if p_parent is not null and not exists (select 1 from public.fin_contracts c where c.organization_id = p_org and c.id = p_parent
       and public.fin_entity_visible(p_org, c.legal_entity_id)) then
    raise exception 'contract not found';
  end if;
  v_currency := coalesce(upper(p_currency), p_terms->>'currency',
    (select e.currency from public.fin_legal_entities e where e.id = p_entity),
    (select o.base_currency from public.fin_organizations o where o.id = p_org));
  insert into public.fin_contracts(organization_id, provider_id, product, starts_on, ends_on, renewal_notice_days, auto_renew,
      owner_id, origin, title, currency, parent_contract_id, legal_entity_id, current_version, terms_updated_at)
    values (p_org, p_provider, p_product, p_starts, p_ends, coalesce(p_notice, 60), coalesce(p_auto_renew, false),
      auth.uid(), 'imported', trim(p_title), v_currency, p_parent, p_entity, 1, now())
    returning id into v_id;
  insert into public.fin_contract_versions(contract_id, organization_id, version, effective_from, source, terms, recorded_by)
    values (v_id, p_org, 1, p_starts, 'import', p_terms, auth.uid());
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (p_org, 'contract', v_id, 'contract_imported', auth.uid(),
      jsonb_build_object('product', p_product, 'terms_fields', (select count(*) from jsonb_object_keys(p_terms)), 'has_parent', p_parent is not null));
  return v_id;
exception when check_violation then raise exception 'invalid contract';
end $$;

revoke all on function public.fin_import_contract(uuid, uuid, uuid, text, text, date, date, integer, boolean, text, jsonb, uuid) from public, anon;
grant execute on function public.fin_import_contract(uuid, uuid, uuid, text, text, date, date, integer, boolean, text, jsonb, uuid) to authenticated, service_role;

create or replace function public.fin_start_contract_rfq(p_contract uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c record; v_id uuid; v_title text;
begin
  select ct.organization_id, ct.product, ct.id, ct.legal_entity_id, ct.origin, ct.title ct_title, r.title, r.description, r.demand into c
    from public.fin_contracts ct
    left join public.fin_decisions d on d.id = ct.decision_id
    left join public.fin_rfqs r on r.id = d.rfq_id and r.organization_id = ct.organization_id
   where ct.id = p_contract for update of ct;
  if not found then raise exception 'contract not found'; end if;
  if not public.fin_entity_allows(c.organization_id, c.legal_entity_id, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if c.product not in ('credit','acquiring') then raise exception 'invalid product'; end if;
  v_title := left('Renovação: ' || coalesce(c.title, c.ct_title, 'contrato existente'), 200);
  insert into public.fin_rfqs(organization_id, product, title, description, demand, owner_id, status, legal_entity_id)
    values (c.organization_id, c.product, v_title, c.description, coalesce(c.demand, '{}'::jsonb), auth.uid(), 'draft', c.legal_entity_id)
    returning id into v_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (c.organization_id, 'contract', c.id, 'renewal_rfq_started', auth.uid(), jsonb_build_object('rfq_id', v_id));
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (c.organization_id, 'rfq', v_id, 'rfq_created_from_contract', auth.uid(), jsonb_build_object('contract_id', c.id));
  return v_id;
end $$;
revoke all on function public.fin_start_contract_rfq(uuid) from public, anon;
grant execute on function public.fin_start_contract_rfq(uuid) to authenticated, service_role;

insert into public.fin_settings (key, value) values ('schema_version', 'financial-followup-hardening-1')
on conflict (key) do update set value = excluded.value, updated_at = now();

commit;

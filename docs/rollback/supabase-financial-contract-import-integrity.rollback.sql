begin;
do $$ begin
 if exists(select 1 from public.fin_contracts where import_request_key is not null) or exists(select 1 from public.fin_events where event_type='contract_owner_assigned') then raise exception 'contract data exists: use forward-fix'; end if;
end $$;
drop trigger if exists fin_contract_import_receipt on public.fin_contracts;
drop function if exists public.fin_contract_import_receipt_guard();
drop function if exists public.fin_assign_contract_owner(uuid,uuid,uuid);
drop function if exists public.fin_contract_import_result(uuid,uuid,uuid);
drop function if exists public.fin_import_contract_intent(uuid,uuid,uuid,jsonb,uuid);
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
drop function if exists public.fin_import_contract_core(uuid,uuid,uuid,text,text,date,date,integer,boolean,text,jsonb,uuid,uuid,boolean);
drop function if exists public.fin_contract_import_actor(uuid,uuid,text[]);
drop function if exists public.fin_contract_owner_eligible(uuid,uuid,uuid);
alter table public.fin_contracts drop constraint if exists fin_contracts_import_receipt;
drop index if exists public.fin_contracts_import_intent;
alter table public.fin_contracts drop column if exists import_request_key;
alter table public.fin_contracts drop column if exists import_request_hash;
alter table public.fin_contracts drop column if exists import_actor_id;
update public.fin_settings set value=(select value from public.fin_settings where key='contract_import_previous_marker'),updated_at=now() where key='schema_version';
delete from public.fin_settings where key='contract_import_previous_marker';
notify pgrst,'reload schema';
commit;

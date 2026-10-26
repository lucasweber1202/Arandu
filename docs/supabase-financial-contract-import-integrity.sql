-- Contract import intent receipts, kept with the financial record.
-- Registered in docs/supabase-migrations.json right after supabase-financial-external-decision.sql.
begin;
insert into public.fin_settings(key,value)
 select 'contract_import_previous_marker',value from public.fin_settings where key='schema_version'
 on conflict(key) do nothing;
alter table public.fin_contracts add column if not exists import_request_key uuid;
alter table public.fin_contracts add column if not exists import_request_hash text;
alter table public.fin_contracts add column if not exists import_actor_id uuid references auth.users(id);
create unique index if not exists fin_contracts_import_intent on public.fin_contracts(organization_id,import_actor_id,import_request_key) where import_request_key is not null;
alter table public.fin_contracts drop constraint if exists fin_contracts_import_receipt;
alter table public.fin_contracts add constraint fin_contracts_import_receipt check(
 (import_request_key is null and import_request_hash is null and import_actor_id is null)
 or (origin='imported' and import_request_key is not null and import_request_hash is not null and import_request_hash ~ '^[a-f0-9]{64}$' and import_actor_id is not null));
create or replace function public.fin_contract_import_actor(p_org uuid,p_entity uuid,p_roles text[])
returns void language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null then raise exception 'forbidden'; end if;
 perform 1 from public.fin_members where organization_id=p_org and user_id=auth.uid() for share;
 perform 1 from public.fin_member_entity_grants where organization_id=p_org and user_id=auth.uid() for share;
 if not public.fin_entity_allows(p_org,p_entity,p_roles) or not exists(select 1 from public.fin_organizations where id=p_org and kind='BUYER') then raise exception 'forbidden'; end if;
 if public.fin_governance_org_locked(p_org) then raise exception 'organization offboarding'; end if;
end $$;
revoke all on function public.fin_contract_import_actor(uuid,uuid,text[]) from public,anon,authenticated,service_role;
create or replace function public.fin_contract_owner_eligible(p_org uuid,p_entity uuid,p_owner uuid)
returns void language plpgsql security definer set search_path='' as $$ begin
 perform 1 from public.fin_members where organization_id=p_org and user_id=p_owner for share;
 perform 1 from public.fin_member_entity_grants where organization_id=p_org and user_id=p_owner for share;
 perform 1 from auth.users where id=p_owner for share;
 if p_owner is null or not public.fin_approval_member_eligible(p_org,p_entity,p_owner,array['admin','finance_manager','analyst'],'any')
 or not exists(select 1 from auth.users where id=p_owner and (banned_until is null or banned_until<=now())) then raise exception 'invalid task assignee'; end if;
end $$;
revoke all on function public.fin_contract_owner_eligible(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create or replace function public.fin_import_contract_core(
  p_org uuid, p_entity uuid, p_provider uuid, p_product text, p_title text,
  p_starts date, p_ends date, p_notice integer default 60, p_auto_renew boolean default false,
  p_currency text default null, p_terms jsonb default '{}'::jsonb, p_parent uuid default null, p_owner uuid default null, p_guard_duplicate boolean default true
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_currency text; v_parent record; v_notice integer; v_review date; v_status text; v_task uuid;
begin
  perform public.fin_contract_import_actor(p_org,p_entity,array['admin','finance_manager']);
  perform public.fin_contract_owner_eligible(p_org,p_entity,coalesce(p_owner,auth.uid()));
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
  if p_guard_duplicate and exists (select 1 from public.fin_contracts c where c.organization_id = p_org and c.provider_id = p_provider
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
      coalesce(p_owner,auth.uid()), 'imported', trim(p_title), v_currency, p_parent, p_entity, 1, now(), v_status)
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
create or replace function public.fin_import_contract(
  p_org uuid, p_entity uuid, p_provider uuid, p_product text, p_title text,
  p_starts date, p_ends date, p_notice integer default 60, p_auto_renew boolean default false,
  p_currency text default null, p_terms jsonb default '{}'::jsonb, p_parent uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
 return public.fin_import_contract_core(p_org,p_entity,p_provider,p_product,p_title,p_starts,p_ends,p_notice,p_auto_renew,p_currency,p_terms,p_parent,auth.uid(),true);
end $$;

revoke all on function public.fin_import_contract_core(uuid,uuid,uuid,text,text,date,date,integer,boolean,text,jsonb,uuid,uuid,boolean) from public,anon,authenticated,service_role;
create or replace function public.fin_import_contract_intent(p_org uuid,p_entity uuid,p_key uuid,p_input jsonb,p_owner uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare h text; c public.fin_contracts%rowtype; v_id uuid; v_input jsonb; v_owner uuid:=coalesce(p_owner,auth.uid());
begin
 perform public.fin_contract_import_actor(p_org,p_entity,array['admin','finance_manager']);
 if p_key is null then raise exception 'invalid request key'; end if;
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>40000
 or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('provider_id','product','title','starts_on','ends_on','renewal_notice_days','auto_renew','currency','terms','parent_contract_id')) then raise exception 'invalid contract'; end if;
 v_input:=jsonb_build_object('provider_id',(p_input->>'provider_id')::uuid,'product',btrim(p_input->>'product'),
  'title',btrim(p_input->>'title'),'starts_on',(p_input->>'starts_on')::date,'ends_on',(p_input->>'ends_on')::date,
  'renewal_notice_days',coalesce((p_input->>'renewal_notice_days')::integer,60),'auto_renew',coalesce((p_input->>'auto_renew')::boolean,false),
  'currency',upper(nullif(btrim(p_input->>'currency'),'')),'terms',coalesce(p_input->'terms','{}'::jsonb),'parent_contract_id',(p_input->>'parent_contract_id')::uuid);
 h:=encode(sha256(convert_to(jsonb_build_object('organization',p_org,'entity',p_entity,'actor',auth.uid(),'owner',v_owner,'input',v_input)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('contract-import:'||p_org||':'||auth.uid()||':'||p_key,0));
 select * into c from public.fin_contracts where organization_id=p_org and import_actor_id=auth.uid() and import_request_key=p_key;
 if c.id is not null then
  if c.import_request_hash is distinct from h then raise exception 'duplicate request'; end if;
  if c.legal_entity_id is distinct from p_entity or not public.fin_entity_visible(p_org,c.legal_entity_id) then raise exception 'forbidden'; end if;
  return jsonb_build_object('id',c.id,'replayed',true,'creation_version',1);
 end if;
 v_id:=public.fin_import_contract_core(p_org,p_entity,(v_input->>'provider_id')::uuid,v_input->>'product',v_input->>'title',
  (v_input->>'starts_on')::date,(v_input->>'ends_on')::date,(v_input->>'renewal_notice_days')::integer,(v_input->>'auto_renew')::boolean,
  v_input->>'currency',coalesce(v_input->'terms','{}'::jsonb),(v_input->>'parent_contract_id')::uuid,v_owner,false);
 update public.fin_contracts set import_request_key=p_key,import_request_hash=h,import_actor_id=auth.uid() where id=v_id;
 return jsonb_build_object('id',v_id,'replayed',false,'creation_version',1);
end $$;
revoke all on function public.fin_import_contract_intent(uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.fin_import_contract_intent(uuid,uuid,uuid,jsonb,uuid) to authenticated;

create or replace function public.fin_contract_import_result(p_org uuid,p_entity uuid,p_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.fin_contracts%rowtype;
begin
 perform public.fin_contract_import_actor(p_org,p_entity,array['admin','finance_manager','analyst','viewer']);
 if p_key is null then raise exception 'invalid request key'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended('contract-import:'||p_org||':'||auth.uid()||':'||p_key,0)) then return jsonb_build_object('state','pending','id',null); end if;
 select * into c from public.fin_contracts where organization_id=p_org and import_actor_id=auth.uid() and import_request_key=p_key
  and legal_entity_id is not distinct from p_entity and public.fin_entity_visible(p_org,legal_entity_id);
 if c.id is null then return jsonb_build_object('state','unconfirmed','id',null); end if;
 return jsonb_build_object('state','confirmed','id',c.id,'creation_version',1,'current_version',c.current_version,'owner_id',c.owner_id,
  'owner_eligible',public.fin_approval_member_eligible(p_org,c.legal_entity_id,c.owner_id,array['admin','finance_manager','analyst'],'any')
    and exists(select 1 from auth.users where id=c.owner_id and (banned_until is null or banned_until<=now())));
end $$;
revoke all on function public.fin_contract_import_result(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.fin_contract_import_result(uuid,uuid,uuid) to authenticated;

create or replace function public.fin_assign_contract_owner(p_contract uuid,p_expected_owner uuid,p_owner uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare c public.fin_contracts%rowtype;
begin
 select * into c from public.fin_contracts where id=p_contract;
 if c.id is null then raise exception 'forbidden'; end if;
 perform public.fin_contract_import_actor(c.organization_id,c.legal_entity_id,array['admin','finance_manager']);
 perform public.fin_contract_owner_eligible(c.organization_id,c.legal_entity_id,p_owner);
 select * into c from public.fin_contracts where id=p_contract for update;
 if not public.fin_entity_visible(c.organization_id,c.legal_entity_id) then raise exception 'forbidden'; end if;
 if c.owner_id=p_owner then return false; end if;
 if c.owner_id is distinct from p_expected_owner then raise exception 'contract version conflict'; end if;
 update public.fin_contracts set owner_id=p_owner,updated_at=now() where id=p_contract;
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
 values(c.organization_id,'contract',c.id,'contract_owner_assigned',auth.uid(),jsonb_build_object('previous_owner_id',c.owner_id,'owner_id',p_owner));
 return true;
end $$;
revoke all on function public.fin_assign_contract_owner(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.fin_assign_contract_owner(uuid,uuid,uuid) to authenticated;

create or replace function public.fin_contract_import_receipt_guard()
returns trigger language plpgsql set search_path='' as $$ begin
 if old.import_request_key is not null and (new.import_request_key,new.import_request_hash,new.import_actor_id,new.organization_id)
 is distinct from (old.import_request_key,old.import_request_hash,old.import_actor_id,old.organization_id) then raise exception 'immutable record'; end if;
 return new;
end $$;
revoke all on function public.fin_contract_import_receipt_guard() from public,anon,authenticated,service_role;
drop trigger if exists fin_contract_import_receipt on public.fin_contracts;
create trigger fin_contract_import_receipt before update on public.fin_contracts for each row execute function public.fin_contract_import_receipt_guard();
insert into public.fin_settings(key,value) values('schema_version', 'financial-contract-import-integrity-1') on conflict(key) do update set value=excluded.value,updated_at=now();
notify pgrst,'reload schema';
commit;

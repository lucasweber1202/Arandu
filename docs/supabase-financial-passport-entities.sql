-- Passport by legal entity. Additive; existing rows remain group scoped.
-- No historical record is rewritten. Forward-fix after entity data is written.
alter table public.fin_company_profiles add column if not exists legal_entity_id uuid;
alter table public.fin_company_profile_history add column if not exists legal_entity_id uuid;
alter table public.fin_company_profile_history add column if not exists verified_at timestamptz;
alter table public.fin_company_profile_history add column if not exists vintage timestamptz;
alter table public.fin_company_profile_history add column if not exists owner_id uuid;
alter table public.fin_rfq_profile_snapshots add column if not exists legal_entity_id uuid;
alter table public.fin_rfq_profile_snapshots add column if not exists source_legal_entity_id uuid;
alter table public.fin_rfq_profile_snapshots add column if not exists original_scope text not null default 'group';
alter table public.fin_rfq_profile_snapshots add column if not exists vintage timestamptz;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='fin_passport_entity_fk') then
    alter table public.fin_company_profiles add constraint fin_passport_entity_fk foreign key(organization_id,legal_entity_id) references public.fin_legal_entities(organization_id,id);
  end if;
end $$;
alter table public.fin_company_profiles drop constraint if exists fin_company_profiles_organization_id_field_key_key;
create unique index if not exists fin_passport_group_key on public.fin_company_profiles(organization_id,field_key) where legal_entity_id is null;
create unique index if not exists fin_passport_entity_key on public.fin_company_profiles(organization_id,legal_entity_id,field_key) where legal_entity_id is not null;
create index if not exists fin_passport_history_scope on public.fin_company_profile_history(organization_id,legal_entity_id,field_key,changed_at desc);

create or replace function public.fin_passport_inheritable(p_key text)
returns boolean language sql immutable set search_path='' as $$
  select p_key in ('sector','moeda_base','necessidades_recorrentes','canais_de_venda');
$$;
revoke all on function public.fin_passport_inheritable(text) from public,anon,authenticated;
-- All buyer members may read allowed group data. Entity data requires scope.
create or replace function public.fin_passport_visible(p_org uuid,p_entity uuid,p_key text)
returns boolean language sql stable security definer set search_path='' as $$
  select public.fin_has_role(p_org) and (public.fin_entity_visible(p_org,p_entity)
    or (p_entity is null and public.fin_passport_inheritable(p_key)));
$$;
revoke all on function public.fin_passport_visible(uuid,uuid,text) from public,anon;
grant execute on function public.fin_passport_visible(uuid,uuid,text) to authenticated;
drop policy if exists fin_profile_read on public.fin_company_profiles;
-- Remove any previous permissive SELECT policy rather than combining it with scoped policy.
do $$ declare p record; begin
 for p in select policyname from pg_policies where schemaname='public' and tablename='fin_company_profiles' and cmd in ('SELECT','ALL') loop
  execute format('drop policy %I on public.fin_company_profiles',p.policyname);
 end loop;
end $$;
create policy fin_profile_read on public.fin_company_profiles for select to authenticated using(public.fin_passport_visible(organization_id,legal_entity_id,field_key));
drop policy if exists fin_profile_history_read on public.fin_company_profile_history;
create policy fin_profile_history_read on public.fin_company_profile_history for select to authenticated using(public.fin_passport_visible(organization_id,legal_entity_id,field_key));
create or replace function public.fin_profile_history_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.fin_company_profile_history(organization_id, legal_entity_id, field_key, change_type, new_value, new_source,
      document_id, valid_until, review_after_days, verified_at, vintage, owner_id, changed_by)
    values (new.organization_id, new.legal_entity_id, new.field_key, 'created', new.field_value, new.source,
      new.document_id, new.valid_until, new.review_after_days, new.verified_at, new.updated_at, new.updated_by, coalesce(auth.uid(), new.updated_by));
  elsif new.field_value is distinct from old.field_value or new.source is distinct from old.source
     or new.document_id is distinct from old.document_id or new.valid_until is distinct from old.valid_until
     or new.review_after_days is distinct from old.review_after_days then
    insert into public.fin_company_profile_history(organization_id, legal_entity_id, field_key, change_type, previous_value, new_value,
      previous_source, new_source, document_id, valid_until, review_after_days, verified_at, vintage, owner_id, changed_by)
    values (new.organization_id, new.legal_entity_id, new.field_key, 'updated', old.field_value, new.field_value,
      old.source, new.source, new.document_id, new.valid_until, new.review_after_days, new.verified_at, new.updated_at, new.updated_by, coalesce(auth.uid(), new.updated_by));
  elsif new.verified_at is distinct from old.verified_at and new.verified_at is not null then
    insert into public.fin_company_profile_history(organization_id, legal_entity_id, field_key, change_type, previous_value, new_value,
      previous_source, new_source, document_id, valid_until, review_after_days, verified_at, vintage, owner_id, changed_by)
    values (new.organization_id, new.legal_entity_id, new.field_key, 'confirmed', old.field_value, new.field_value,
      old.source, new.source, new.document_id, new.valid_until, new.review_after_days, new.verified_at, new.updated_at, new.updated_by, coalesce(auth.uid(), new.verified_by));
  end if;
  return new;
end $$;
create or replace function public.fin_passport_scope_guard() returns trigger language plpgsql set search_path='' as $$ begin
 if new.organization_id is distinct from old.organization_id or new.legal_entity_id is distinct from old.legal_entity_id or new.field_key is distinct from old.field_key then raise exception 'immutable passport scope'; end if;
 return new;
end $$;
revoke all on function public.fin_passport_scope_guard() from public,anon,authenticated;
drop trigger if exists fin_passport_scope_guard on public.fin_company_profiles;
create trigger fin_passport_scope_guard before update on public.fin_company_profiles for each row execute function public.fin_passport_scope_guard();
create unique index if not exists fin_passport_scope_key on public.fin_company_profiles(organization_id,legal_entity_id,field_key) nulls not distinct;
create or replace function public.fin_passport_set_scoped_field(
  p_org uuid, p_entity uuid, p_key text, p_value text, p_source text,
  p_document_id uuid default null, p_valid_until date default null, p_review_after_days integer default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_days integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.fin_entity_allows(p_org, p_entity, array['admin','finance_manager','analyst']) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.fin_organizations o where o.id = p_org and o.kind = 'BUYER') then
    raise exception 'buyer organization required';
  end if;
  if p_key is null or p_key !~ '^[a-z][a-z0-9_]{1,48}$' then raise exception 'invalid profile field'; end if;
  if p_value is null or length(trim(p_value)) not between 1 and 500 or p_value ~ '[<>]' then raise exception 'invalid profile value'; end if;
  -- Origens reservadas exigem caminho próprio (importação, integração, extração).
  if p_source is null or p_source not in ('declarado_pela_empresa','documento_interno','extrato','contrato_vigente','outro') then
    raise exception 'invalid profile source';
  end if;
  if p_entity is not null and not exists(select 1 from public.fin_legal_entities where organization_id=p_org and id=p_entity and kind='legal_entity' and status='active') then raise exception 'invalid legal entity'; end if;
  v_days := coalesce(p_review_after_days, 180);
  if v_days not between 7 and 1825 then raise exception 'invalid review period'; end if;
  -- Documento: só um documento privado do PERFIL desta organização, não removido.
  if p_document_id is not null and not exists (
      select 1 from public.fin_private_documents d
       where d.id = p_document_id and d.organization_id = p_org and d.entity_type = 'profile'
         and d.entity_id = coalesce(p_entity,p_org) and d.removed_at is null) then
    raise exception 'invalid profile document';
  end if;

  insert into public.fin_company_profiles as cp (organization_id, legal_entity_id, field_key, field_value, source, status, valid_until,
    review_after_days, document_id, updated_by, updated_at, verified_at, verified_by)
  values (p_org, p_entity, p_key, trim(p_value), p_source, 'informado', p_valid_until, v_days, p_document_id, auth.uid(), now(), null, null)
  on conflict (organization_id, legal_entity_id, field_key) do update set
    field_value = excluded.field_value, source = excluded.source, status = 'informado',
    valid_until = excluded.valid_until, review_after_days = excluded.review_after_days,
    document_id = excluded.document_id, updated_by = excluded.updated_by, updated_at = now(),
    -- A confirmação valia para o valor anterior.
    verified_at = case when cp.field_value = excluded.field_value and cp.source = excluded.source
                        and cp.document_id is not distinct from excluded.document_id then cp.verified_at end,
    verified_by = case when cp.field_value = excluded.field_value and cp.source = excluded.source
                        and cp.document_id is not distinct from excluded.document_id then cp.verified_by end
  returning id into v_id;

  -- A trilha guarda o campo, nunca o valor.
  insert into public.fin_events(organization_id, legal_entity_id, entity_type, entity_id, event_type, actor_id, metadata)
  values (p_org, p_entity, 'profile', coalesce(p_entity,p_org), 'profile_field_saved', auth.uid(), jsonb_build_object('legal_entity_id',p_entity,'field_key', p_key, 'source', p_source));
  return v_id;
end $$;
revoke all on function public.fin_passport_set_scoped_field(uuid, uuid, text, text, text, uuid, date, integer) from public, anon;
grant execute on function public.fin_passport_set_scoped_field(uuid, uuid, text, text, text, uuid, date, integer) to authenticated;

create or replace function public.fin_passport_confirm_scoped_field(p_org uuid, p_entity uuid, p_key text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_at timestamptz := now();
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.fin_entity_allows(p_org, p_entity, array['admin','finance_manager','analyst']) then raise exception 'forbidden'; end if;
  update public.fin_company_profiles set verified_at = v_at, verified_by = auth.uid(), status = 'revisado'
   where organization_id = p_org and legal_entity_id is not distinct from p_entity and field_key = p_key;
  if not found then raise exception 'invalid profile field'; end if;
  insert into public.fin_events(organization_id, legal_entity_id, entity_type, entity_id, event_type, actor_id, metadata)
  values (p_org, p_entity, 'profile', coalesce(p_entity,p_org), 'profile_field_confirmed', auth.uid(), jsonb_build_object('legal_entity_id',p_entity,'field_key', p_key));
  return v_at;
end $$;
revoke all on function public.fin_passport_confirm_scoped_field(uuid, uuid, text) from public, anon;
grant execute on function public.fin_passport_confirm_scoped_field(uuid, uuid, text) to authenticated;

create or replace function public.fin_passport_set_field(p_org uuid,p_key text,p_value text,p_source text,p_document_id uuid default null,p_valid_until date default null,p_review_after_days integer default null)
returns uuid language sql security definer set search_path='' as $$ select public.fin_passport_set_scoped_field(p_org,null,p_key,p_value,p_source,p_document_id,p_valid_until,p_review_after_days); $$;
create or replace function public.fin_passport_confirm_field(p_org uuid,p_key text)
returns timestamptz language sql security definer set search_path='' as $$ select public.fin_passport_confirm_scoped_field(p_org,null,p_key); $$;
create or replace function public.fin_create_rfq_from_passport(
  p_org uuid, p_product text, p_title text, p_description text, p_demand jsonb, p_deadline date, p_usage jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_rfq uuid; v_item jsonb; v_key text; v_demand_key text; v_row public.fin_company_profiles%rowtype;
  v_entity uuid; v_org public.fin_organizations%rowtype; v_value text; v_source text; v_due date; v_given text;
begin
  if jsonb_typeof(coalesce(p_usage, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_usage, '[]'::jsonb)) > 10 then
    raise exception 'invalid passport usage';
  end if;
  -- Papel, produto, demanda e tipo de organização: as mesmas regras de fin_create_rfq.
  v_rfq := public.fin_create_rfq(p_org, p_product, p_title, p_description, p_demand, p_deadline);
  select legal_entity_id into v_entity from public.fin_rfqs where id=v_rfq;
  select * into v_org from public.fin_organizations where id = p_org;
  for v_item in select * from jsonb_array_elements(coalesce(p_usage, '[]'::jsonb)) loop
    v_key := v_item->>'field_key';
    v_demand_key := v_item->>'demand_key';
    if v_key is null or v_key !~ '^[a-z][a-z0-9_]{1,48}$' or v_demand_key is null or v_demand_key !~ '^[a-z][a-z0-9_]{1,48}$' then
      raise exception 'invalid passport usage';
    end if;
    if not ((p_product='credit' and (v_demand_key,v_key) in (('annual_revenue','receita_anual'),('sector','sector'),('operating_years','tempo_operacao_anos'),('collateral','garantias_disponiveis'))) or (p_product='acquiring' and (v_demand_key,v_key) in (('monthly_volume','volume_cartoes_mensal'),('average_ticket','ticket_medio'),('current_acquirer','adquirente_atual'),('current_anticipation','antecipacao_atual')))) then raise exception 'invalid passport usage'; end if;
    if v_key = 'sector' then
      -- Campo do cadastro da organização: sem período de revisão.
      if v_org.sector is null then raise exception 'invalid passport usage'; end if;
      v_value := v_org.sector; v_source := 'cadastro_organizacao'; v_due := null;
      v_row := null;
    else
      select * into v_row from public.fin_company_profiles where organization_id = p_org and field_key = v_key
        and (legal_entity_id is not distinct from v_entity or (legal_entity_id is null and public.fin_passport_inheritable(v_key)))
        order by (legal_entity_id is not null) desc limit 1;
      if not found then raise exception 'invalid passport usage'; end if;
      v_value := v_row.field_value; v_source := v_row.source;
      v_due := public.fin_passport_review_due(v_row.updated_at, v_row.verified_at, v_row.review_after_days, v_row.valid_until);
    end if;
    v_given := p_demand->>v_demand_key;
    insert into public.fin_rfq_profile_snapshots(organization_id, rfq_id, legal_entity_id, source_legal_entity_id, original_scope, vintage, field_key, demand_key, field_value, source,
      profile_updated_at, profile_updated_by, verified_at, document_id, review_due_on, freshness, used_as_is, captured_by)
    values (p_org, v_rfq, v_entity, v_row.legal_entity_id, case when v_row.legal_entity_id is null then 'group' else 'entity' end, v_row.updated_at, v_key, v_demand_key, v_value, v_source,
      v_row.updated_at, v_row.updated_by, v_row.verified_at, v_row.document_id, v_due,
      public.fin_passport_freshness(v_due, (now() at time zone 'UTC')::date),
      coalesce(v_given = v_value or public.fin_try_numeric(v_given) = public.fin_try_numeric(v_value), false),
      auth.uid());
  end loop;
  if jsonb_array_length(coalesce(p_usage, '[]'::jsonb)) > 0 then
    insert into public.fin_events(organization_id, legal_entity_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (p_org, v_entity, 'rfq', v_rfq, 'rfq_passport_snapshot', auth.uid(), jsonb_build_object('fields', jsonb_array_length(p_usage)));
  end if;
  return v_rfq;
end $$;
revoke all on function public.fin_create_rfq_from_passport(uuid, text, text, text, jsonb, date, jsonb) from public, anon;
grant execute on function public.fin_create_rfq_from_passport(uuid, text, text, text, jsonb, date, jsonb) to authenticated;

create or replace function public.fin_document_begin_upload(
  p_org uuid, p_entity_type text, p_entity_id uuid, p_title text, p_visibility text,
  p_mime text, p_size bigint, p_sha256 text default null, p_document_id uuid default null
) returns table(document_id uuid, version integer, bucket text, path text)
language plpgsql security definer set search_path = '' as $$
declare v_doc public.fin_private_documents%rowtype; v_buyer uuid; v_rfq uuid; v_version integer; v_path text;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  if not public.fin_document_mime_allowed(p_mime) then raise exception 'document type not allowed'; end if;
  if p_size is null or p_size < 1 or p_size > 10485760 then raise exception 'document too large'; end if;
  if p_sha256 is not null and p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'invalid document hash'; end if;
  if (select count(*) from public.fin_document_versions v where v.uploaded_by = auth.uid() and v.status = 'pending'
      and v.created_at > now() - interval '1 hour') >= 20 then raise exception 'too many pending uploads'; end if;

  if p_document_id is not null then
    select * into v_doc from public.fin_private_documents d where d.id = p_document_id for update;
    if not public.fin_can_read_document(p_document_id) then raise exception 'forbidden'; end if;
    if not found or v_doc.removed_at is not null or v_doc.organization_id <> p_org then raise exception 'forbidden'; end if;
    if not public.fin_has_role(v_doc.organization_id, case when v_doc.organization_id = v_doc.buyer_organization_id
        then array['admin','finance_manager','analyst'] else array['admin','provider_user'] end) then raise exception 'forbidden'; end if;
  else
    if length(coalesce(trim(p_title), '')) < 2 then raise exception 'invalid document title'; end if;
    if p_visibility not in ('internal','shared') then raise exception 'invalid visibility'; end if;
    if p_entity_type = 'proposal' then
      select p.buyer_organization_id, p.rfq_id into v_buyer, v_rfq from public.fin_proposals p
       where p.id = p_entity_id and p.provider_organization_id = p_org;
      if v_buyer is null or not public.fin_has_role(p_org, array['admin','provider_user']) then raise exception 'forbidden'; end if;
    else
      if not public.fin_has_role(p_org, array['admin','finance_manager','analyst']) then raise exception 'forbidden'; end if;
      v_buyer := p_org;
      if p_entity_type = 'rfq' then
        select r.id into v_rfq from public.fin_rfqs r where r.id = p_entity_id and r.organization_id = p_org;
        if v_rfq is null then raise exception 'forbidden'; end if;
      elsif p_entity_type = 'contract' then
        if not exists (select 1 from public.fin_contracts c where c.id = p_entity_id and c.organization_id = p_org) then raise exception 'forbidden'; end if;
        select d.rfq_id into v_rfq from public.fin_contracts c join public.fin_decisions d on d.id = c.decision_id where c.id = p_entity_id;
        if p_visibility <> 'internal' then raise exception 'invalid visibility'; end if;
      elsif p_entity_type = 'profile' then
        if p_visibility <> 'internal' or not public.fin_entity_allows(p_org,case when p_entity_id=p_org then null else p_entity_id end,array['admin','finance_manager','analyst']) then raise exception 'forbidden'; end if;
        if p_entity_id<>p_org and not exists(select 1 from public.fin_legal_entities where organization_id=p_org and id=p_entity_id and kind='legal_entity' and status='active') then raise exception 'forbidden'; end if;
      else
        raise exception 'invalid entity';
      end if;
    end if;
    insert into public.fin_private_documents (organization_id, buyer_organization_id, entity_type, entity_id, rfq_id, title, visibility, created_by)
    values (p_org, v_buyer, p_entity_type, p_entity_id, v_rfq, trim(p_title), p_visibility, auth.uid())
    returning * into v_doc;
  end if;

  select coalesce(max(v.version), 0) + 1 into v_version from public.fin_document_versions v where v.document_id = v_doc.id;
  -- O caminho não carrega nome de arquivo nem dado pessoal.
  v_path := v_doc.organization_id::text || '/' || v_doc.id::text || '/v' || v_version || '-' || gen_random_uuid()::text;
  insert into public.fin_document_versions (document_id, version, storage_path, mime_type, size_bytes, sha256, uploaded_by)
  values (v_doc.id, v_version, v_path, p_mime, p_size, p_sha256, auth.uid());
  return query select v_doc.id, v_version, 'fin-documents'::text, v_path;
end $$;
create or replace function public.fin_can_read_document(p_document uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.fin_private_documents d
     where d.id = p_document and d.removed_at is null and (
       (public.fin_has_role(d.organization_id) and (d.organization_id <> d.buyer_organization_id
          or (d.entity_type = 'profile' and public.fin_entity_visible(d.organization_id,case when d.entity_id=d.organization_id then null else d.entity_id end)) or (d.entity_type <> 'profile' and public.fin_object_visible(d.organization_id, d.entity_type, d.entity_id))))
       or (d.visibility = 'shared' and d.organization_id = d.buyer_organization_id and d.rfq_id is not null
           and public.fin_provider_can_comment('rfq', d.rfq_id))
       or (d.visibility = 'shared' and d.organization_id <> d.buyer_organization_id and public.fin_has_role(d.buyer_organization_id)
           and (d.rfq_id is null or public.fin_rfq_visible(d.rfq_id)))
     ));
$$;

create or replace function public.fin_document_entity_guard() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is not null and public.fin_has_role(new.buyer_organization_id) then
  if new.entity_type='profile' then
   if not public.fin_entity_visible(new.organization_id,case when new.entity_id=new.organization_id then null else new.entity_id end) then raise exception 'forbidden'; end if;
  elsif not public.fin_object_visible(new.buyer_organization_id,new.entity_type,new.entity_id) then raise exception 'forbidden'; end if;
 end if;
 return new;
end $$;
create or replace function public.fin_search_passport(p_org uuid,p_entity uuid,p_query text,p_limit integer default 20,p_offset integer default 0)
returns table(id uuid,field_key text,field_value text,legal_entity_id uuid,source text,updated_at timestamptz)
language plpgsql stable security invoker set search_path='' as $$ begin
 if not public.fin_has_role(p_org) or (p_entity is not null and not public.fin_entity_visible(p_org,p_entity)) then raise exception 'forbidden'; end if;
 if length(trim(coalesce(p_query,''))) not between 2 and 100 or p_limit is null or p_offset is null or p_limit not between 1 and 50 or p_offset not between 0 and 1000 then raise exception 'invalid search'; end if;
 return query select r.id,r.field_key,r.field_value,r.legal_entity_id,r.source,r.updated_at from (
  select distinct on (cp.field_key) cp.* from public.fin_company_profiles cp
  where cp.organization_id=p_org and (cp.legal_entity_id is not distinct from p_entity or (p_entity is not null and cp.legal_entity_id is null and cp.field_key in ('sector','moeda_base','necessidades_recorrentes','canais_de_venda')))
  order by cp.field_key,(cp.legal_entity_id is not null) desc
 ) r where position(lower(trim(p_query)) in lower(r.field_key||' '||r.field_value))>0 order by r.field_key limit p_limit offset p_offset;
end $$;
revoke all on function public.fin_search_passport(uuid,uuid,text,integer,integer) from public,anon;
grant execute on function public.fin_search_passport(uuid,uuid,text,integer,integer) to authenticated;
revoke all on function public.fin_passport_inheritable(text) from authenticated;
insert into public.fin_settings(key,value) values('schema_version', 'financial-passport-entities-1') on conflict(key) do update set value=excluded.value,updated_at=now();

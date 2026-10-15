-- Revalidação da autorização de uploads já reservados. Sem novas tabelas.
-- O ator vem de uploaded_by persistido, nunca de parâmetro da API ou claims
-- reescritos. O helper é privado inclusive para service_role.
-- Ordem: membro -> objeto/entidade -> concessão -> documento -> versão.
-- FOR SHARE impede remoção/rebaixamento do vínculo e revogação de escopo
-- durante a publicação; FOR UPDATE do documento serializa remoção/publicação.
begin;
create or replace function public.fin_document_lock_upload_authorization(p_document uuid, p_actor uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare d public.fin_private_documents%rowtype; locked_d public.fin_private_documents%rowtype;
  m public.fin_members%rowtype; v_entity uuid; v_parent uuid; v_grant uuid;
begin
  select * into d from public.fin_private_documents where id=p_document;
  if not found or p_actor is null or d.removed_at is not null then return false; end if;
  select * into m from public.fin_members
    where organization_id=d.organization_id and user_id=p_actor for share;
  if not found then return false; end if;
  if d.organization_id=d.buyer_organization_id then
    if m.role not in ('admin','finance_manager','analyst') then return false; end if;
    if d.entity_type='rfq' then
      select legal_entity_id into v_entity from public.fin_rfqs where id=d.entity_id and organization_id=d.organization_id for share;
      if not found then return false; end if;
    elsif d.entity_type='contract' then
      select legal_entity_id into v_entity from public.fin_contracts where id=d.entity_id and organization_id=d.organization_id for share;
      if not found then return false; end if;
    elsif d.entity_type='profile' then
      v_entity := case when d.entity_id=d.organization_id then null else d.entity_id end;
    else return false;
    end if;
    if v_entity is not null then
      select parent_id into v_parent from public.fin_legal_entities
        where id=v_entity and organization_id=d.organization_id for share;
      if not found then return false; end if;
    end if;
    if m.entity_scope <> 'group' then
      if v_entity is null then return false; end if;
      select entity_id into v_grant from public.fin_member_entity_grants
        where organization_id=d.organization_id and user_id=p_actor
          and entity_id in (v_entity,v_parent) order by entity_id limit 1 for share;
      if not found then return false; end if;
    end if;
  else
    if m.role not in ('admin','provider_user') or d.entity_type <> 'proposal' then return false; end if;
    perform 1 from public.fin_proposals where id=d.entity_id
      and provider_organization_id=d.organization_id and buyer_organization_id=d.buyer_organization_id for share;
    if not found then return false; end if;
  end if;
  select * into locked_d from public.fin_private_documents where id=p_document for update;
  return found and locked_d.removed_at is null
    and locked_d.organization_id=d.organization_id and locked_d.buyer_organization_id=d.buyer_organization_id
    and locked_d.entity_type=d.entity_type and locked_d.entity_id=d.entity_id;
end $$;
revoke all on function public.fin_document_lock_upload_authorization(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.fin_document_pending_upload(p_document uuid, p_version integer)
returns table(bucket text, path text, mime_type text, size_bytes bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.fin_document_versions v where v.document_id=p_document
      and v.version=p_version and v.status='pending' and v.uploaded_by=auth.uid()
      and v.created_at > now()-interval '10 minutes') then return; end if;
  if not public.fin_document_lock_upload_authorization(p_document,auth.uid()) then return; end if;
  return query select v.storage_bucket,v.storage_path,v.mime_type,v.size_bytes
    from public.fin_document_versions v where v.document_id=p_document and v.version=p_version
      and v.status='pending' and v.uploaded_by=auth.uid() and v.created_at > now()-interval '10 minutes';
end $$;
revoke all on function public.fin_document_pending_upload(uuid,integer) from public,anon;
grant execute on function public.fin_document_pending_upload(uuid,integer) to authenticated;

create or replace function public.fin_document_finalize_upload(p_document uuid, p_version integer, p_size bigint, p_mime text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_row public.fin_document_versions%rowtype; v_doc public.fin_private_documents%rowtype; v_event text;
begin
  -- Leitura inicial sem lock identifica o autor persistido; a versão é relida
  -- depois dos locks. Nenhum ator informado pelo cliente é aceito.
  select * into v_row from public.fin_document_versions where document_id=p_document and version=p_version;
  if not found then raise exception 'invalid document'; end if;
  if not public.fin_document_lock_upload_authorization(p_document,v_row.uploaded_by) then raise exception 'forbidden'; end if;
  select * into v_row from public.fin_document_versions where document_id = p_document and version = p_version for update;
  if not found then raise exception 'invalid document'; end if;
  if v_row.status <> 'pending' then return v_row.status; end if;
  if v_row.created_at <= now() - interval '10 minutes'
     or p_size is distinct from v_row.size_bytes or p_mime is distinct from v_row.mime_type then
    update public.fin_document_versions set status = 'failed', completed_at = now() where document_id = p_document and version = p_version;
    return 'failed';
  end if;
  update public.fin_document_versions set status = 'available', completed_at = now() where document_id = p_document and version = p_version;
  update public.fin_private_documents set current_version = greatest(current_version, p_version) where id = p_document
  returning * into v_doc;
  v_event := case when p_version = 1 then 'document_uploaded' else 'document_version_added' end;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
  values (v_doc.organization_id, v_doc.entity_type, v_doc.entity_id, v_event, v_row.uploaded_by,
    jsonb_build_object('document_id', v_doc.id, 'version', p_version, 'mime_type', v_row.mime_type, 'size_bytes', v_row.size_bytes));
  if v_doc.visibility = 'shared' and v_doc.organization_id <> v_doc.buyer_organization_id and v_doc.rfq_id is not null then
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v_doc.buyer_organization_id, 'rfq', v_doc.rfq_id, v_event, v_row.uploaded_by,
      jsonb_build_object('document_id', v_doc.id, 'version', p_version));
  end if;
  return 'available';
end $$;
revoke all on function public.fin_document_finalize_upload(uuid, integer, bigint, text) from public, anon, authenticated;
grant execute on function public.fin_document_finalize_upload(uuid, integer, bigint, text) to service_role;

insert into public.fin_settings(key,value) values ('schema_version', 'financial-document-upload-authorization-1')
on conflict(key) do update set value=excluded.value,updated_at=now();
commit;

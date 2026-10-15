-- Reabre a lacuna de upload após revogação: preferir forward-fix. Não altera dados.
begin;
create or replace function public.fin_document_pending_upload(p_document uuid, p_version integer)
returns table(bucket text, path text, mime_type text, size_bytes bigint)
language sql stable security definer set search_path = '' as $$
  select v.storage_bucket, v.storage_path, v.mime_type, v.size_bytes from public.fin_document_versions v
   where v.document_id = p_document and v.version = p_version and v.status = 'pending' and v.uploaded_by = auth.uid()
     and v.created_at > now() - interval '10 minutes';
$$;
revoke all on function public.fin_document_pending_upload(uuid, integer) from public, anon;
grant execute on function public.fin_document_pending_upload(uuid, integer) to authenticated;

create or replace function public.fin_document_finalize_upload(p_document uuid, p_version integer, p_size bigint, p_mime text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_row public.fin_document_versions%rowtype; v_doc public.fin_private_documents%rowtype; v_event text;
begin
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
drop function public.fin_document_lock_upload_authorization(uuid,uuid);
insert into public.fin_settings(key,value) values('schema_version','financial-session-revocation-1')
on conflict(key) do update set value=excluded.value,updated_at=now();
commit;

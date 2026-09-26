-- Reverte a rodada de piloto. Exporte documentos (metadados e objetos do bucket
-- fin-documents), execuções de job e o log de acesso operacional antes de aplicar.
-- O bucket e os objetos no Storage NÃO são apagados por este script.
drop function if exists public.fin_is_operator();
drop function if exists public.fin_ops_trace(text, uuid);
drop function if exists public.fin_ops_overview();
drop function if exists public.fin_require_operator();
drop function if exists public.fin_jwt_aal();
drop function if exists public.fin_record_job_run(text, text, integer, text, text, timestamptz);
drop table if exists public.fin_ops_access_log;
drop table if exists public.fin_job_runs;
drop table if exists public.fin_platform_operators;

drop function if exists public.fin_document_remove(uuid);
drop function if exists public.fin_document_authorize_download(uuid, integer);
drop function if exists public.fin_document_finalize_upload(uuid, integer, bigint, text);
drop function if exists public.fin_document_pending_upload(uuid, integer);
drop function if exists public.fin_document_begin_upload(uuid, text, uuid, text, text, text, bigint, text, uuid);
drop table if exists public.fin_document_versions;
drop table if exists public.fin_private_documents;
drop function if exists public.fin_can_read_document(uuid);
drop function if exists public.fin_document_mime_allowed(text);

drop function if exists public.fin_comment_authors(text, uuid);
drop function if exists public.fin_update_my_member_profile(uuid, text, text);
drop trigger if exists fin_member_default_name on public.fin_members;
drop function if exists public.fin_member_default_name();
alter table public.fin_members drop constraint if exists fin_members_job_title_check;
alter table public.fin_members drop constraint if exists fin_members_display_name_check;
alter table public.fin_members drop column if exists job_title;
alter table public.fin_members drop column if exists display_name;

-- Volta à regra anterior de leitura de comentários e de respostas.
drop policy if exists fin_comment_read on public.fin_comments;
create policy fin_comment_read on public.fin_comments for select to authenticated using (
  public.fin_has_role(organization_id)
  or (visibility = 'provider_visible' and public.fin_provider_can_comment(object_type, object_id))
);
create or replace function public.fin_reply_comment(
  p_parent uuid, p_body text, p_mention_ids uuid[] default '{}'::uuid[], p_client_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_parent public.fin_comments%rowtype; v_id uuid; v_parent_now uuid;
begin
  select * into v_parent from public.fin_comments where id = p_parent;
  if not found or v_parent.parent_id is not null then raise exception 'invalid parent'; end if;
  if not (public.fin_has_role(v_parent.organization_id)
          or (v_parent.visibility = 'provider_visible' and public.fin_provider_can_comment(v_parent.object_type, v_parent.object_id))) then
    raise exception 'forbidden';
  end if;
  v_id := public.fin_add_comment(v_parent.object_type, v_parent.object_id, v_parent.visibility, p_body, p_mention_ids, p_client_id);
  update public.fin_comments set parent_id = p_parent where id = v_id and parent_id is null;
  select parent_id into v_parent_now from public.fin_comments where id = v_id;
  if v_parent_now is distinct from p_parent then raise exception 'comment conflict'; end if;
  if v_parent.author_id <> auth.uid()
     and exists (select 1 from public.fin_members m where m.organization_id = v_parent.organization_id and m.user_id = v_parent.author_id) then
    insert into public.fin_notifications(organization_id, user_id, event_type, object_type, object_id, event_id, title, body)
    values (v_parent.organization_id, v_parent.author_id, 'comment', v_parent.object_type, v_parent.object_id, v_id,
      'Responderam ao seu comentário', 'Abra o processo para ler a resposta.')
    on conflict (user_id, event_type, event_id) do nothing;
  end if;
  return v_id;
end $$;
drop function if exists public.fin_provider_reads_comment(uuid, uuid, text, uuid);

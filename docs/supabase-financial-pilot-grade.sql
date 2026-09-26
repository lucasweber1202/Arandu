-- Financial Procurement — rodada de piloto (aditiva).
--
-- 1. Confidencialidade entre provedores: um comentário "visível ao provedor"
--    escrito por um provedor só é lido pela empresa compradora e pela própria
--    instituição que escreveu. Perguntas de um concorrente não vazam. O que a
--    empresa compradora publica como visível continua chegando a todos os
--    provedores que aceitaram o convite.
-- 2. Identidade dos membros: nome e cargo por organização, sem e-mail. Cada
--    pessoa edita apenas o próprio registro.
-- 3. Documentos privados: bucket privado, sem política de Storage para o
--    navegador. Toda subida e todo download passam por uma RPC que autoriza no
--    contexto do usuário e registra o evento; só então o servidor assina uma
--    URL curta com o service role. A URL temporária nunca é persistida.
-- 4. Console operacional: operadores da plataforma (tabela própria, fora dos
--    papéis das empresas) veem saúde de jobs, outbox e uploads, exigindo MFA,
--    sem valores, termos, documentos ou conteúdo de clientes.

-- ------------------------------------------------ 1. comentários entre provedores
create or replace function public.fin_provider_reads_comment(p_org uuid, p_author uuid, p_type text, p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.fin_provider_can_comment(p_type, p_id) and (
    -- escrito pela empresa compradora: vale para todos os provedores do processo
    exists (select 1 from public.fin_members m where m.organization_id = p_org and m.user_id = p_author)
    -- escrito pela própria instituição de quem lê
    or exists (select 1 from public.fin_members author join public.fin_members me on me.organization_id = author.organization_id
               where author.user_id = p_author and me.user_id = auth.uid() and me.role in ('admin','provider_user'))
  );
$$;
revoke all on function public.fin_provider_reads_comment(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.fin_provider_reads_comment(uuid, uuid, text, uuid) to authenticated, service_role;

drop policy if exists fin_comment_read on public.fin_comments;
create policy fin_comment_read on public.fin_comments for select to authenticated using (
  public.fin_has_role(organization_id)
  or (visibility = 'provider_visible' and public.fin_provider_reads_comment(organization_id, author_id, object_type, object_id))
);

-- Resposta segue a mesma regra de leitura: provedor não responde a quem não lê.
create or replace function public.fin_reply_comment(
  p_parent uuid, p_body text, p_mention_ids uuid[] default '{}'::uuid[], p_client_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_parent public.fin_comments%rowtype; v_id uuid; v_parent_now uuid;
begin
  select * into v_parent from public.fin_comments where id = p_parent;
  if not found or v_parent.parent_id is not null then raise exception 'invalid parent'; end if;
  if not (public.fin_has_role(v_parent.organization_id)
          or (v_parent.visibility = 'provider_visible'
              and public.fin_provider_reads_comment(v_parent.organization_id, v_parent.author_id, v_parent.object_type, v_parent.object_id))) then
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
revoke all on function public.fin_reply_comment(uuid, text, uuid[], uuid) from public, anon;
grant execute on function public.fin_reply_comment(uuid, text, uuid[], uuid) to authenticated, service_role;

-- --------------------------------------------------------- 2. identidade
alter table public.fin_members add column if not exists display_name text;
alter table public.fin_members add column if not exists job_title text;
alter table public.fin_members drop constraint if exists fin_members_display_name_check;
alter table public.fin_members add constraint fin_members_display_name_check
  check (display_name is null or (length(display_name) between 2 and 120 and display_name !~ '[<>@]'));
alter table public.fin_members drop constraint if exists fin_members_job_title_check;
alter table public.fin_members add constraint fin_members_job_title_check
  check (job_title is null or (length(job_title) between 2 and 80 and job_title !~ '[<>]'));

-- Nome inicial vem do perfil da conta, quando existir e for um nome (não um e-mail).
create or replace function public.fin_member_default_name()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if new.display_name is null and to_regclass('public.profiles') is not null then
    execute 'select trim(full_name) from public.profiles where id = $1' into v_name using new.user_id;
    if v_name is not null and length(v_name) between 2 and 120 and v_name !~ '[<>@]' then new.display_name := v_name; end if;
  end if;
  return new;
end $$;
revoke all on function public.fin_member_default_name() from public, anon, authenticated;
drop trigger if exists fin_member_default_name on public.fin_members;
create trigger fin_member_default_name before insert on public.fin_members
for each row execute function public.fin_member_default_name();

do $$
begin
  if to_regclass('public.profiles') is not null then
    update public.fin_members m set display_name = trim(p.full_name)
      from public.profiles p
     where p.id = m.user_id and m.display_name is null
       and length(trim(p.full_name)) between 2 and 120 and trim(p.full_name) !~ '[<>@]';
  end if;
end $$;

create or replace function public.fin_update_my_member_profile(p_org uuid, p_display_name text, p_job_title text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  update public.fin_members
     set display_name = nullif(trim(p_display_name), ''), job_title = nullif(trim(p_job_title), '')
   where organization_id = p_org and user_id = auth.uid();
  if not found then raise exception 'forbidden'; end if;
end $$;
revoke all on function public.fin_update_my_member_profile(uuid, text, text) from public, anon;
grant execute on function public.fin_update_my_member_profile(uuid, text, text) to authenticated;

-- Autores de comentários que a pessoa já pode ler: nome e instituição, nunca e-mail.
create or replace function public.fin_comment_authors(p_type text, p_id uuid)
returns table(author_id uuid, display_name text, organization_name text, organization_kind text)
language sql stable security definer set search_path = '' as $$
  select distinct on (c.author_id) c.author_id, m.display_name, o.legal_name, o.kind
    from public.fin_comments c
    join public.fin_members m on m.user_id = c.author_id
    join public.fin_organizations o on o.id = m.organization_id
   where c.object_type = p_type and c.object_id = p_id
     and (public.fin_has_role(c.organization_id)
          or (c.visibility = 'provider_visible' and public.fin_provider_reads_comment(c.organization_id, c.author_id, c.object_type, c.object_id)))
   order by c.author_id, (m.organization_id = c.organization_id) desc, m.created_at;
$$;
revoke all on function public.fin_comment_authors(text, uuid) from public, anon;
grant execute on function public.fin_comment_authors(text, uuid) to authenticated;

-- ------------------------------------------------------- 3. documentos privados
create table if not exists public.fin_private_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  buyer_organization_id uuid not null references public.fin_organizations(id),
  entity_type text not null check (entity_type in ('rfq','proposal','contract','profile')),
  entity_id uuid not null,
  rfq_id uuid,
  title text not null check (length(title) between 2 and 200 and title !~ '[<>]'),
  visibility text not null check (visibility in ('internal','shared')),
  current_version integer not null default 0 check (current_version >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references auth.users(id),
  check (entity_type in ('rfq','proposal') or visibility = 'internal')
);
create index if not exists fin_private_documents_entity on public.fin_private_documents(entity_type, entity_id);
create index if not exists fin_private_documents_rfq on public.fin_private_documents(rfq_id) where rfq_id is not null;

create table if not exists public.fin_document_versions (
  document_id uuid not null references public.fin_private_documents(id),
  version integer not null check (version >= 1),
  storage_bucket text not null default 'fin-documents' check (storage_bucket = 'fin-documents'),
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/v[0-9]+-[0-9a-f-]{36}$'),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending','available','failed')),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (document_id, version)
);

alter table public.fin_private_documents enable row level security;
alter table public.fin_private_documents force row level security;
alter table public.fin_document_versions enable row level security;
alter table public.fin_document_versions force row level security;
revoke all on public.fin_private_documents, public.fin_document_versions from anon, authenticated;
grant select on public.fin_private_documents, public.fin_document_versions to authenticated;

create or replace function public.fin_document_mime_allowed(p_mime text)
returns boolean language sql immutable set search_path = '' as $$
  select p_mime = any (array[
    'application/pdf', 'image/jpeg', 'image/png',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]);
$$;

-- Quem lê: a organização dona; provedores com convite aceito no processo, se a
-- empresa compartilhou; a empresa compradora, se o provedor compartilhou.
-- Um provedor nunca lê documento de outro provedor.
create or replace function public.fin_can_read_document(p_document uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.fin_private_documents d
     where d.id = p_document and d.removed_at is null and (
       public.fin_has_role(d.organization_id)
       or (d.visibility = 'shared' and d.organization_id = d.buyer_organization_id and d.rfq_id is not null
           and public.fin_provider_can_comment('rfq', d.rfq_id))
       or (d.visibility = 'shared' and d.organization_id <> d.buyer_organization_id and public.fin_has_role(d.buyer_organization_id))
     ));
$$;
revoke all on function public.fin_can_read_document(uuid) from public, anon;
grant execute on function public.fin_can_read_document(uuid) to authenticated, service_role;

drop policy if exists fin_private_document_read on public.fin_private_documents;
create policy fin_private_document_read on public.fin_private_documents for select to authenticated
  using (public.fin_can_read_document(id));
drop policy if exists fin_document_version_read on public.fin_document_versions;
create policy fin_document_version_read on public.fin_document_versions for select to authenticated
  using (status = 'available' and public.fin_can_read_document(document_id));

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('fin-documents', 'fin-documents', false, 10485760, array[
      'application/pdf', 'image/jpeg', 'image/png',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

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
        if p_entity_id <> p_org or p_visibility <> 'internal' then raise exception 'forbidden'; end if;
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
revoke all on function public.fin_document_begin_upload(uuid, text, uuid, text, text, text, bigint, text, uuid) from public, anon;
grant execute on function public.fin_document_begin_upload(uuid, text, uuid, text, text, text, bigint, text, uuid) to authenticated;

-- Passo do usuário: só quem iniciou conclui, e só versão pendente.
create or replace function public.fin_document_pending_upload(p_document uuid, p_version integer)
returns table(bucket text, path text, mime_type text, size_bytes bigint)
language sql stable security definer set search_path = '' as $$
  select v.storage_bucket, v.storage_path, v.mime_type, v.size_bytes from public.fin_document_versions v
   where v.document_id = p_document and v.version = p_version and v.status = 'pending' and v.uploaded_by = auth.uid();
$$;
revoke all on function public.fin_document_pending_upload(uuid, integer) from public, anon;
grant execute on function public.fin_document_pending_upload(uuid, integer) to authenticated;

-- Passo do servidor: confere o objeto no Storage e só então publica a versão.
create or replace function public.fin_document_finalize_upload(p_document uuid, p_version integer, p_size bigint, p_mime text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_row public.fin_document_versions%rowtype; v_doc public.fin_private_documents%rowtype; v_event text;
begin
  select * into v_row from public.fin_document_versions where document_id = p_document and version = p_version for update;
  if not found then raise exception 'invalid document'; end if;
  if v_row.status <> 'pending' then return v_row.status; end if;
  if p_size is distinct from v_row.size_bytes or p_mime is distinct from v_row.mime_type then
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

create or replace function public.fin_document_authorize_download(p_document uuid, p_version integer default null)
returns table(bucket text, path text, mime_type text, title text, version integer)
language plpgsql security definer set search_path = '' as $$
declare v_doc public.fin_private_documents%rowtype; v_row public.fin_document_versions%rowtype;
begin
  if auth.uid() is null or not public.fin_can_read_document(p_document) then raise exception 'forbidden'; end if;
  select d.* into v_doc from public.fin_private_documents d where d.id = p_document;
  select dv.* into v_row from public.fin_document_versions dv
   where dv.document_id = p_document and dv.version = coalesce(p_version, v_doc.current_version) and dv.status = 'available';
  if not found then raise exception 'document not available'; end if;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
  values (v_doc.organization_id, v_doc.entity_type, v_doc.entity_id, 'document_downloaded', auth.uid(),
    jsonb_build_object('document_id', v_doc.id, 'version', v_row.version));
  return query select v_row.storage_bucket, v_row.storage_path, v_row.mime_type, v_doc.title, v_row.version;
end $$;
revoke all on function public.fin_document_authorize_download(uuid, integer) from public, anon;
grant execute on function public.fin_document_authorize_download(uuid, integer) to authenticated;

-- Remover esconde o documento; versões e objetos ficam para retenção e auditoria.
create or replace function public.fin_document_remove(p_document uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_doc public.fin_private_documents%rowtype;
begin
  select * into v_doc from public.fin_private_documents where id = p_document for update;
  if not found or v_doc.removed_at is not null then raise exception 'invalid document'; end if;
  if not (public.fin_has_role(v_doc.organization_id, case when v_doc.organization_id = v_doc.buyer_organization_id
            then array['admin','finance_manager'] else array['admin'] end)
          or (v_doc.created_by = auth.uid() and public.fin_has_role(v_doc.organization_id))) then
    raise exception 'forbidden';
  end if;
  update public.fin_private_documents set removed_at = now(), removed_by = auth.uid() where id = p_document;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
  values (v_doc.organization_id, v_doc.entity_type, v_doc.entity_id, 'document_removed', auth.uid(), jsonb_build_object('document_id', v_doc.id));
end $$;
revoke all on function public.fin_document_remove(uuid) from public, anon;
grant execute on function public.fin_document_remove(uuid) to authenticated;

-- ------------------------------------------------------ 4. console operacional
create table if not exists public.fin_platform_operators (
  user_id uuid primary key references auth.users(id),
  role text not null default 'ops_viewer' check (role in ('ops_viewer')),
  granted_by text not null check (length(granted_by) between 2 and 120),
  created_at timestamptz not null default now()
);
create table if not exists public.fin_job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null check (job in ('renewals')),
  status text not null check (status in ('succeeded','failed')),
  processed integer not null default 0 check (processed >= 0),
  request_id text check (request_id is null or request_id ~ '^[A-Za-z0-9-]{1,80}$'),
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_]{1,60}$'),
  started_at timestamptz not null,
  finished_at timestamptz not null default now()
);
create index if not exists fin_job_runs_recent on public.fin_job_runs(job, finished_at desc);
create table if not exists public.fin_ops_access_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  action text not null check (action in ('overview','trace')),
  lookup text check (lookup is null or length(lookup) <= 80),
  happened_at timestamptz not null default now()
);
alter table public.fin_platform_operators enable row level security;
alter table public.fin_platform_operators force row level security;
alter table public.fin_job_runs enable row level security;
alter table public.fin_job_runs force row level security;
alter table public.fin_ops_access_log enable row level security;
alter table public.fin_ops_access_log force row level security;
revoke all on public.fin_platform_operators, public.fin_job_runs, public.fin_ops_access_log from anon, authenticated;

create or replace function public.fin_record_job_run(p_job text, p_status text, p_processed integer, p_request_id text, p_error_code text, p_started_at timestamptz)
returns void language sql security definer set search_path = '' as $$
  insert into public.fin_job_runs (job, status, processed, request_id, error_code, started_at)
  values (p_job, p_status, greatest(coalesce(p_processed, 0), 0), p_request_id, p_error_code, p_started_at);
$$;
revoke all on function public.fin_record_job_run(text, text, integer, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.fin_record_job_run(text, text, integer, text, text, timestamptz) to service_role;

create or replace function public.fin_jwt_aal()
returns text language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal',
                  nullif(current_setting('request.jwt.claim.aal', true), ''), 'aal1');
$$;

create or replace function public.fin_require_operator()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.fin_platform_operators o where o.user_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  if public.fin_jwt_aal() <> 'aal2' then raise exception 'mfa required'; end if;
end $$;
revoke all on function public.fin_require_operator() from public, anon, authenticated;

-- Só contagens, estados e identificadores. Nenhum valor, termo, título,
-- endereço de e-mail, payload ou documento.
create or replace function public.fin_ops_overview()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform public.fin_require_operator();
  insert into public.fin_ops_access_log (user_id, action) values (auth.uid(), 'overview');
  select jsonb_build_object(
    'schema_version', 'financial-pilot-grade-1',
    'generated_at', now(),
    'email_enabled', public.fin_setting('email_enabled', 'false') = 'true',
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('job', j.job, 'status', j.status, 'processed', j.processed, 'request_id', j.request_id,
        'error_code', j.error_code, 'started_at', j.started_at, 'finished_at', j.finished_at) order by j.finished_at desc)
      from (select * from public.fin_job_runs order by finished_at desc limit 10) j), '[]'::jsonb),
    'last_renewal_success', (select max(finished_at) from public.fin_job_runs where job = 'renewals' and status = 'succeeded'),
    'renewal_milestones_24h', (select count(*) from public.fin_renewal_milestones where triggered_at > now() - interval '24 hours'),
    'outbox', jsonb_build_object(
      'by_status', coalesce((select jsonb_object_agg(status, total) from (select status, count(*) total from public.transactional_email_outbox
          where template = 'finance_notification' group by status) s), '{}'::jsonb),
      'oldest_pending_minutes', (select floor(extract(epoch from now() - min(created_at)) / 60) from public.transactional_email_outbox
          where template = 'finance_notification' and status in ('pending','retry')),
      'recent_failures', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'status', o.status, 'attempts', o.attempts,
          'error_code', o.last_error_code, 'created_at', o.created_at) order by o.created_at desc)
        from (select * from public.transactional_email_outbox where template = 'finance_notification' and status in ('retry','dead')
              order by created_at desc limit 10) o), '[]'::jsonb)),
    'documents', jsonb_build_object(
      'pending_over_1h', (select count(*) from public.fin_document_versions where status = 'pending' and created_at < now() - interval '1 hour'),
      'failed_24h', (select count(*) from public.fin_document_versions where status = 'failed' and completed_at > now() - interval '24 hours'),
      'available_total', (select count(*) from public.fin_document_versions where status = 'available')),
    'notifications_24h', (select count(*) from public.fin_notifications where created_at > now() - interval '24 hours')
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.fin_ops_overview() from public, anon;
grant execute on function public.fin_ops_overview() to authenticated;

-- Diagnóstico por identificador: eventos sem metadados (que podem citar
-- instituições) e execuções de job. Nada de conteúdo.
create or replace function public.fin_ops_trace(p_request_id text default null, p_entity_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.fin_require_operator();
  if p_request_id is null and p_entity_id is null then raise exception 'lookup required'; end if;
  if p_request_id is not null and p_request_id !~ '^[A-Za-z0-9-]{1,80}$' then raise exception 'invalid lookup'; end if;
  insert into public.fin_ops_access_log (user_id, action, lookup) values (auth.uid(), 'trace', coalesce(p_request_id, p_entity_id::text));
  return jsonb_build_object(
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('job', job, 'status', status, 'processed', processed, 'error_code', error_code, 'finished_at', finished_at))
      from public.fin_job_runs where p_request_id is not null and request_id = p_request_id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('organization_id', e.organization_id, 'entity_type', e.entity_type, 'entity_id', e.entity_id,
        'event_type', e.event_type, 'happened_at', e.happened_at) order by e.happened_at desc)
      from (select * from public.fin_events where p_entity_id is not null and (entity_id = p_entity_id or organization_id = p_entity_id)
            order by happened_at desc limit 50) e), '[]'::jsonb));
end $$;
revoke all on function public.fin_ops_trace(text, uuid) from public, anon;
grant execute on function public.fin_ops_trace(text, uuid) to authenticated;

create or replace function public.fin_is_operator()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.fin_platform_operators o where o.user_id = auth.uid());
$$;
revoke all on function public.fin_is_operator() from public, anon;
grant execute on function public.fin_is_operator() to authenticated;

-- Multi-entity foundation (guideline §11, addendum v2.1 H.1 item 4).
-- Aditivo e idempotente. Rollback: docs/rollback/supabase-financial-multi-entity.rollback.sql
--
-- Modelo:
--   * O grupo econômico é a organização compradora (fin_organizations BUYER):
--     continua sendo o tenant e a fronteira de isolamento entre clientes.
--   * fin_legal_entities guarda as entidades legais do grupo e, abaixo delas,
--     unidades de negócio (um nível). Cada uma com moeda local; o grupo ganha
--     moeda base (fin_organizations.base_currency). Nada é convertido: moeda é
--     contexto, não taxa de câmbio.
--   * Escopo de acesso por membro: `group` (tesouraria do grupo — todas as
--     entidades e os objetos de nível de grupo) ou `entities` (somente as
--     entidades concedidas em fin_member_entity_grants; a concessão de uma
--     entidade legal cobre as unidades abaixo dela). Membros existentes nascem
--     `group`: nenhuma permissão atual muda.
--   * RFQs e contratos ganham legal_entity_id. NULL = objeto de nível de grupo,
--     visível só para escopo `group` (fail-closed para escopo restrito).
--   * O contrato herda a entidade da RFQ de origem; tarefas, comentários,
--     documentos e eventos herdam a entidade do objeto a que se referem.
--   * Leitura: toda policy do lado comprador passa por fin_entity_visible; a
--     busca (SECURITY DEFINER) também. Consolidação é feita sobre linhas que o
--     RLS já filtrou: um agregado nunca inclui entidade que a pessoa não lê.
--   * Escrita: gatilhos centrais recusam, para membro da compradora, qualquer
--     criação/alteração em objeto de entidade que ele não alcança — inclusive
--     quando a escrita vem de uma RPC existente. Mudança de entidade de RFQ ou
--     contrato só acontece pelas RPCs próprias, com trilha.
--   * Trilha: fin_events.legal_entity_id preserva o escopo em que a ação ocorreu.
--
-- O que NÃO muda: provedores (diretório do grupo) e Financial Passport (perfil do
-- grupo) continuam de nível de grupo e legíveis por todo membro, como hoje. O
-- Passport por entidade é um passo posterior (IMPLEMENTATION_MATRIX P0.3-02).

-- ------------------------------------------------------------ 1. entidades
alter table public.fin_organizations add column if not exists base_currency text not null default 'BRL';
alter table public.fin_organizations drop constraint if exists fin_organizations_base_currency_check;
alter table public.fin_organizations add constraint fin_organizations_base_currency_check check (base_currency ~ '^[A-Z]{3}$');

create table if not exists public.fin_legal_entities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  kind text not null default 'legal_entity' check (kind in ('legal_entity','business_unit')),
  parent_id uuid,
  legal_name text not null check (length(trim(legal_name)) between 2 and 200 and legal_name !~ '[<>]'),
  short_name text check (short_name is null or (length(trim(short_name)) between 1 and 60 and short_name !~ '[<>]')),
  tax_identifier text check (tax_identifier is null or tax_identifier ~ '^[0-9]{14}$'),
  country text not null default 'BR' check (country ~ '^[A-Z]{2}$'),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, parent_id) references public.fin_legal_entities(organization_id, id),
  check ((kind = 'legal_entity' and parent_id is null) or (kind = 'business_unit' and parent_id is not null)),
  check ((status = 'archived') = (archived_at is not null))
);
create unique index if not exists fin_legal_entities_tax_unique on public.fin_legal_entities(organization_id, tax_identifier) where tax_identifier is not null;
create index if not exists fin_legal_entities_parent on public.fin_legal_entities(organization_id, parent_id);

alter table public.fin_members add column if not exists entity_scope text not null default 'group';
alter table public.fin_members drop constraint if exists fin_members_entity_scope_check;
alter table public.fin_members add constraint fin_members_entity_scope_check check (entity_scope in ('group','entities'));
-- Administrar membros e entidades é papel do grupo: administrador restrito a
-- uma entidade (delegated admin) é capacidade posterior, com desenho próprio.
alter table public.fin_members drop constraint if exists fin_members_admin_group_scope;
alter table public.fin_members add constraint fin_members_admin_group_scope check (role <> 'admin' or entity_scope = 'group');

create table if not exists public.fin_member_entity_grants (
  organization_id uuid not null,
  user_id uuid not null,
  entity_id uuid not null,
  granted_by uuid not null references auth.users(id),
  granted_at timestamptz not null default now(),
  primary key (organization_id, user_id, entity_id),
  foreign key (organization_id, user_id) references public.fin_members(organization_id, user_id) on delete cascade,
  foreign key (organization_id, entity_id) references public.fin_legal_entities(organization_id, id)
);
create index if not exists fin_member_entity_grants_entity on public.fin_member_entity_grants(organization_id, entity_id);

-- ------------------------------------------------- 2. colunas de entidade
alter table public.fin_rfqs add column if not exists legal_entity_id uuid;
alter table public.fin_contracts add column if not exists legal_entity_id uuid;
alter table public.fin_tasks add column if not exists legal_entity_id uuid;
alter table public.fin_events add column if not exists legal_entity_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fin_rfqs_legal_entity_fk') then
    alter table public.fin_rfqs add constraint fin_rfqs_legal_entity_fk
      foreign key (organization_id, legal_entity_id) references public.fin_legal_entities(organization_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fin_contracts_legal_entity_fk') then
    alter table public.fin_contracts add constraint fin_contracts_legal_entity_fk
      foreign key (organization_id, legal_entity_id) references public.fin_legal_entities(organization_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fin_tasks_legal_entity_fk') then
    alter table public.fin_tasks add constraint fin_tasks_legal_entity_fk
      foreign key (organization_id, legal_entity_id) references public.fin_legal_entities(organization_id, id);
  end if;
end $$;
create index if not exists fin_rfqs_entity_idx on public.fin_rfqs(organization_id, legal_entity_id, status);
create index if not exists fin_contracts_entity_idx on public.fin_contracts(organization_id, legal_entity_id, ends_on);
create index if not exists fin_tasks_entity_idx on public.fin_tasks(organization_id, legal_entity_id);
create index if not exists fin_events_entity_idx on public.fin_events(organization_id, legal_entity_id, happened_at desc);

-- ------------------------------------------------- 3. funções de escopo
-- Escopo do chamador na organização; NULL quando não é membro.
create or replace function public.fin_entity_scope(p_org uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.entity_scope from public.fin_members m where m.organization_id = p_org and m.user_id = auth.uid();
$$;

-- Verdadeiro quando o chamador é membro (com um dos papéis, se informados) e
-- alcança a entidade: escopo de grupo alcança tudo, inclusive objetos sem
-- entidade; escopo restrito alcança só entidade concedida ou unidade abaixo dela.
create or replace function public.fin_entity_allows(p_org uuid, p_entity uuid, p_roles text[] default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.fin_members m
     where m.organization_id = p_org and m.user_id = auth.uid()
       and (p_roles is null or m.role = any(p_roles))
       and (m.entity_scope = 'group' or (p_entity is not null and exists (
         select 1 from public.fin_legal_entities e
           join public.fin_member_entity_grants g
             on g.organization_id = e.organization_id and g.user_id = m.user_id
            and (g.entity_id = e.id or g.entity_id = e.parent_id)
          where e.organization_id = p_org and e.id = p_entity))));
$$;

create or replace function public.fin_entity_visible(p_org uuid, p_entity uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.fin_entity_allows(p_org, p_entity, null);
$$;

-- Entidade de um objeto do procurement, resolvida no banco (nunca do cliente).
create or replace function public.fin_object_legal_entity(p_type text, p_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select case p_type
    when 'rfq' then (select r.legal_entity_id from public.fin_rfqs r where r.id = p_id)
    when 'proposal' then (select r.legal_entity_id from public.fin_proposals p join public.fin_rfqs r on r.id = p.rfq_id where p.id = p_id)
    when 'decision' then (select r.legal_entity_id from public.fin_decisions d join public.fin_rfqs r on r.id = d.rfq_id where d.id = p_id)
    when 'approval' then (select r.legal_entity_id from public.fin_approval_requests a join public.fin_rfqs r on r.id = a.rfq_id where a.id = p_id)
    when 'contract' then (select c.legal_entity_id from public.fin_contracts c where c.id = p_id)
    when 'task' then (select t.legal_entity_id from public.fin_tasks t where t.id = p_id)
    when 'legal_entity' then p_id
    else null end;
$$;

-- Objetos que pertencem a um processo/contrato herdam a entidade dele; objetos
-- de nível de grupo (organização, Passport, provedor) seguem visíveis a todo
-- membro, como antes desta migration.
create or replace function public.fin_object_visible(p_org uuid, p_type text, p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_type in ('rfq','proposal','decision','approval','contract','task','legal_entity')
      then public.fin_entity_visible(p_org, public.fin_object_legal_entity(p_type, p_id))
    else public.fin_has_role(p_org) end;
$$;

create or replace function public.fin_rfq_visible(p_rfq uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fin_rfqs r where r.id = p_rfq and public.fin_entity_visible(r.organization_id, r.legal_entity_id));
$$;

create or replace function public.fin_contract_visible(p_contract uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fin_contracts c where c.id = p_contract and public.fin_entity_visible(c.organization_id, c.legal_entity_id));
$$;

-- Guarda de escrita: só se aplica a membro da organização dona do objeto.
-- Provedores e jobs (sem sessão) seguem pelas guardas das próprias RPCs.
create or replace function public.fin_assert_entity_write(p_org uuid, p_entity uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is not null and public.fin_has_role(p_org) and not public.fin_entity_visible(p_org, p_entity) then
    raise exception 'forbidden';
  end if;
end $$;

-- ------------------------------------------------- 4. gatilhos centrais
create or replace function public.fin_rfq_entity_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_setting text;
begin
  if tg_op = 'INSERT' then
    if new.legal_entity_id is null then
      v_setting := nullif(current_setting('arandu.legal_entity', true), '');
      if v_setting is not null then new.legal_entity_id := v_setting::uuid; end if;
    end if;
    if new.legal_entity_id is not null and not exists (
      select 1 from public.fin_legal_entities e where e.organization_id = new.organization_id and e.id = new.legal_entity_id and e.status = 'active') then
      raise exception 'invalid legal entity';
    end if;
    perform public.fin_assert_entity_write(new.organization_id, new.legal_entity_id);
  else
    perform public.fin_assert_entity_write(old.organization_id, old.legal_entity_id);
    if new.legal_entity_id is distinct from old.legal_entity_id then
      if coalesce(current_setting('arandu.entity_change', true), '') <> 'on' then raise exception 'legal entity change requires rpc'; end if;
      perform public.fin_assert_entity_write(new.organization_id, new.legal_entity_id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists fin_rfqs_entity_guard on public.fin_rfqs;
create trigger fin_rfqs_entity_guard before insert or update on public.fin_rfqs
  for each row execute function public.fin_rfq_entity_guard();

create or replace function public.fin_contract_entity_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    -- Contrato nasce na entidade da RFQ que o originou.
    if new.legal_entity_id is null then
      select r.legal_entity_id into new.legal_entity_id
        from public.fin_decisions d join public.fin_rfqs r on r.id = d.rfq_id where d.id = new.decision_id;
    end if;
    perform public.fin_assert_entity_write(new.organization_id, new.legal_entity_id);
  else
    perform public.fin_assert_entity_write(old.organization_id, old.legal_entity_id);
    if new.legal_entity_id is distinct from old.legal_entity_id then
      if coalesce(current_setting('arandu.entity_change', true), '') <> 'on' then raise exception 'legal entity change requires rpc'; end if;
      perform public.fin_assert_entity_write(new.organization_id, new.legal_entity_id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists fin_contracts_entity_guard on public.fin_contracts;
create trigger fin_contracts_entity_guard before insert or update on public.fin_contracts
  for each row execute function public.fin_contract_entity_guard();

-- Decisão, pedido de aprovação e convite: a RFQ precisa estar ao alcance.
create or replace function public.fin_rfq_child_entity_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_entity uuid;
begin
  select r.organization_id, r.legal_entity_id into v_org, v_entity from public.fin_rfqs r where r.id = new.rfq_id;
  if v_org is not null then perform public.fin_assert_entity_write(v_org, v_entity); end if;
  return new;
end $$;
drop trigger if exists fin_decisions_entity_guard on public.fin_decisions;
create trigger fin_decisions_entity_guard before insert or update on public.fin_decisions
  for each row execute function public.fin_rfq_child_entity_guard();
drop trigger if exists fin_approval_requests_entity_guard on public.fin_approval_requests;
create trigger fin_approval_requests_entity_guard before insert or update on public.fin_approval_requests
  for each row execute function public.fin_rfq_child_entity_guard();
drop trigger if exists fin_rfq_invites_entity_guard on public.fin_rfq_invites;
create trigger fin_rfq_invites_entity_guard before insert on public.fin_rfq_invites
  for each row execute function public.fin_rfq_child_entity_guard();

-- Etapa de aprovação: o aprovador escolhido precisa alcançar a entidade (no
-- pedido) e continuar alcançando quando age (escopo revogado no meio do fluxo).
create or replace function public.fin_approval_step_entity_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_entity uuid; v_ok boolean;
begin
  select r.organization_id, r.legal_entity_id into v_org, v_entity
    from public.fin_approval_requests a join public.fin_rfqs r on r.id = a.rfq_id where a.id = new.request_id;
  if v_org is null then return new; end if;
  if tg_op = 'INSERT' then
    select m.entity_scope = 'group' or (v_entity is not null and exists (
             select 1 from public.fin_legal_entities e join public.fin_member_entity_grants g
               on g.organization_id = e.organization_id and g.user_id = m.user_id and (g.entity_id = e.id or g.entity_id = e.parent_id)
              where e.organization_id = v_org and e.id = v_entity))
      into v_ok from public.fin_members m where m.organization_id = v_org and m.user_id = new.approver_id;
    if not coalesce(v_ok, false) then raise exception 'invalid approver'; end if;
  else
    perform public.fin_assert_entity_write(v_org, v_entity);
  end if;
  return new;
end $$;
drop trigger if exists fin_approval_steps_entity_guard on public.fin_approval_steps;
create trigger fin_approval_steps_entity_guard before insert or update on public.fin_approval_steps
  for each row execute function public.fin_approval_step_entity_guard();

-- Tarefa herda a entidade do objeto relacionado.
create or replace function public.fin_task_entity_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.related_type is distinct from old.related_type or new.related_id is distinct from old.related_id then
    new.legal_entity_id := case when new.related_type is null or new.related_id is null then null
      else public.fin_object_legal_entity(new.related_type, new.related_id) end;
  end if;
  if tg_op = 'UPDATE' then perform public.fin_assert_entity_write(old.organization_id, old.legal_entity_id); end if;
  -- Tarefa avulsa (sem objeto) de quem a cria continua permitida a qualquer escopo.
  if not (new.related_type is null and new.created_by = auth.uid()) then
    perform public.fin_assert_entity_write(new.organization_id, new.legal_entity_id);
  end if;
  return new;
end $$;
drop trigger if exists fin_tasks_entity_guard on public.fin_tasks;
create trigger fin_tasks_entity_guard before insert or update on public.fin_tasks
  for each row execute function public.fin_task_entity_guard();

-- Comentário e documento privado: o objeto precisa estar ao alcance de quem escreve.
create or replace function public.fin_comment_entity_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and public.fin_has_role(new.organization_id)
     and not public.fin_object_visible(new.organization_id, new.object_type, new.object_id) then
    raise exception 'forbidden';
  end if;
  return new;
end $$;
drop trigger if exists fin_comments_entity_guard on public.fin_comments;
create trigger fin_comments_entity_guard before insert on public.fin_comments
  for each row execute function public.fin_comment_entity_guard();

create or replace function public.fin_document_entity_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and public.fin_has_role(new.buyer_organization_id) and new.entity_type <> 'profile'
     and not public.fin_object_visible(new.buyer_organization_id, new.entity_type, new.entity_id) then
    raise exception 'forbidden';
  end if;
  return new;
end $$;
drop trigger if exists fin_private_documents_entity_guard on public.fin_private_documents;
create trigger fin_private_documents_entity_guard before insert on public.fin_private_documents
  for each row execute function public.fin_document_entity_guard();

-- Trilha: o escopo da entidade é gravado no momento do evento.
create or replace function public.fin_event_entity_stamp()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.legal_entity_id is null then
    new.legal_entity_id := public.fin_object_legal_entity(new.entity_type, new.entity_id);
  end if;
  return new;
end $$;
drop trigger if exists fin_events_entity_stamp on public.fin_events;
create trigger fin_events_entity_stamp before insert on public.fin_events
  for each row execute function public.fin_event_entity_stamp();

-- ------------------------------------------------- 5. policies de leitura
alter table public.fin_legal_entities enable row level security;
alter table public.fin_legal_entities force row level security;
alter table public.fin_member_entity_grants enable row level security;
alter table public.fin_member_entity_grants force row level security;
revoke all on public.fin_legal_entities, public.fin_member_entity_grants from anon, authenticated;
grant select on public.fin_legal_entities, public.fin_member_entity_grants to authenticated;

drop policy if exists fin_legal_entity_read on public.fin_legal_entities;
create policy fin_legal_entity_read on public.fin_legal_entities for select to authenticated
  using (public.fin_entity_visible(organization_id, id));
drop policy if exists fin_member_entity_grant_read on public.fin_member_entity_grants;
create policy fin_member_entity_grant_read on public.fin_member_entity_grants for select to authenticated
  using (user_id = auth.uid() and public.fin_has_role(organization_id) or public.fin_has_role(organization_id, array['admin']));

drop policy if exists fin_rfq_read on public.fin_rfqs;
create policy fin_rfq_read on public.fin_rfqs for select to authenticated
  using (
    public.fin_entity_visible(organization_id, legal_entity_id)
    or exists (select 1 from public.fin_rfq_invites i
               where i.rfq_id = fin_rfqs.id and i.status = 'accepted'
                 and i.provider_organization_id is not null
                 and public.fin_has_role(i.provider_organization_id))
  );
drop policy if exists fin_invite_read on public.fin_rfq_invites;
create policy fin_invite_read on public.fin_rfq_invites for select to authenticated
  using (
    (public.fin_has_role(buyer_organization_id) and public.fin_rfq_visible(rfq_id))
    or (provider_organization_id is not null and public.fin_has_role(provider_organization_id))
  );
drop policy if exists fin_proposal_read on public.fin_proposals;
create policy fin_proposal_read on public.fin_proposals for select to authenticated
  using ((public.fin_has_role(buyer_organization_id) and public.fin_rfq_visible(rfq_id)) or public.fin_has_role(provider_organization_id));
drop policy if exists fin_proposal_version_read on public.fin_proposal_versions;
create policy fin_proposal_version_read on public.fin_proposal_versions for select to authenticated
  using (exists (select 1 from public.fin_proposals p
                 where p.id = fin_proposal_versions.proposal_id
                   and ((public.fin_has_role(p.buyer_organization_id) and public.fin_rfq_visible(p.rfq_id))
                        or public.fin_has_role(p.provider_organization_id))));
drop policy if exists fin_decision_read on public.fin_decisions;
create policy fin_decision_read on public.fin_decisions for select to authenticated
  using (public.fin_has_role(organization_id) and public.fin_rfq_visible(rfq_id));
drop policy if exists fin_contract_read on public.fin_contracts;
create policy fin_contract_read on public.fin_contracts for select to authenticated
  using (public.fin_entity_visible(organization_id, legal_entity_id));
drop policy if exists fin_approval_request_read on public.fin_approval_requests;
create policy fin_approval_request_read on public.fin_approval_requests for select to authenticated
  using (public.fin_has_role(organization_id) and public.fin_rfq_visible(rfq_id));
drop policy if exists fin_approval_step_read on public.fin_approval_steps;
create policy fin_approval_step_read on public.fin_approval_steps for select to authenticated
  using (exists (select 1 from public.fin_approval_requests r where r.id = request_id
                   and public.fin_has_role(r.organization_id) and public.fin_rfq_visible(r.rfq_id)));
drop policy if exists fin_rfq_revision_read on public.fin_rfq_revisions;
create policy fin_rfq_revision_read on public.fin_rfq_revisions for select to authenticated
  using ((public.fin_has_role(organization_id) and public.fin_rfq_visible(rfq_id)) or public.fin_provider_can_comment('rfq', rfq_id));
drop policy if exists fin_rfq_profile_snapshot_read on public.fin_rfq_profile_snapshots;
create policy fin_rfq_profile_snapshot_read on public.fin_rfq_profile_snapshots for select to authenticated
  using (public.fin_has_role(organization_id) and public.fin_rfq_visible(rfq_id));
drop policy if exists fin_renewal_read on public.fin_renewal_milestones;
create policy fin_renewal_read on public.fin_renewal_milestones for select to authenticated
  using (public.fin_has_role(organization_id) and public.fin_contract_visible(contract_id));
drop policy if exists fin_task_read on public.fin_tasks;
create policy fin_task_read on public.fin_tasks for select to authenticated
  using (public.fin_entity_visible(organization_id, legal_entity_id)
         or (related_type is null and created_by = auth.uid() and public.fin_has_role(organization_id)));
drop policy if exists fin_task_edit on public.fin_tasks;
create policy fin_task_edit on public.fin_tasks for update to authenticated
  using (public.fin_has_role(organization_id, array['admin','finance_manager','analyst'])
         and (public.fin_entity_visible(organization_id, legal_entity_id) or (related_type is null and created_by = auth.uid())))
  with check (public.fin_has_role(organization_id, array['admin','finance_manager','analyst']));
drop policy if exists fin_event_read on public.fin_events;
create policy fin_event_read on public.fin_events for select to authenticated
  using (public.fin_entity_visible(organization_id, legal_entity_id));
drop policy if exists fin_comment_read on public.fin_comments;
create policy fin_comment_read on public.fin_comments for select to authenticated using (
  (public.fin_has_role(organization_id) and public.fin_object_visible(organization_id, object_type, object_id))
  or (visibility = 'provider_visible' and public.fin_provider_reads_comment(organization_id, author_id, object_type, object_id))
);

-- Documento privado: leitura do lado comprador também respeita a entidade.
create or replace function public.fin_can_read_document(p_document uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.fin_private_documents d
     where d.id = p_document and d.removed_at is null and (
       (public.fin_has_role(d.organization_id) and (d.organization_id <> d.buyer_organization_id
          or d.entity_type = 'profile' or public.fin_object_visible(d.organization_id, d.entity_type, d.entity_id)))
       or (d.visibility = 'shared' and d.organization_id = d.buyer_organization_id and d.rfq_id is not null
           and public.fin_provider_can_comment('rfq', d.rfq_id))
       or (d.visibility = 'shared' and d.organization_id <> d.buyer_organization_id and public.fin_has_role(d.buyer_organization_id)
           and (d.rfq_id is null or public.fin_rfq_visible(d.rfq_id)))
     ));
$$;

-- Busca: mesma lógica de antes, com o filtro de entidade em cada ramo.
create or replace function public.fin_search(p_org uuid,p_query text,p_kind text default null,p_limit integer default 12,p_offset integer default 0)
returns table(kind text,id uuid,title text,detail text,href text)
language plpgsql stable security definer set search_path = '' as $$
declare v_query text;
begin
 if not public.fin_has_role(p_org,array['admin','finance_manager','analyst','viewer']) then raise exception 'forbidden'; end if;
 v_query:=lower(trim(coalesce(p_query,'')));
 if length(v_query) not between 2 and 100 or p_limit not between 1 and 30 or p_offset not between 0 and 1000
 or (p_kind is not null and p_kind not in ('rfq','proposal','provider','contract','task')) then
  raise exception 'invalid search'; end if;
 return query
 select x.kind,x.id,x.title,x.detail,x.href from (
  select 'rfq'::text kind,r.id,r.title::text,coalesce(r.status,'')::text detail,
    ('/finance/rfq.html?id='||r.id)::text href, 1 priority,r.created_at sorted_at
  from public.fin_rfqs r where r.organization_id=p_org and (p_kind is null or p_kind='rfq')
    and public.fin_entity_visible(p_org, r.legal_entity_id)
    and (position(v_query in lower(r.title))>0 or position(v_query in lower(r.id::text))>0)
  union all
  select 'proposal'::text,p.id,coalesce(v.name,'Proposta')::text,r.title::text,
    ('/finance/rfq.html?id='||r.id)::text,2,p.updated_at
  from public.fin_proposals p join public.fin_rfqs r on r.id=p.rfq_id and r.organization_id=p_org
   left join public.fin_providers v on v.id=p.provider_id and v.organization_id=p_org
  where p.buyer_organization_id=p_org and (p_kind is null or p_kind='proposal')
   and public.fin_entity_visible(p_org, r.legal_entity_id)
   and (position(v_query in lower(coalesce(v.name,'')))>0 or position(v_query in lower(r.title))>0 or position(v_query in lower(p.id::text))>0)
  union all
  select 'provider'::text,v.id,v.name::text,coalesce(v.region,'')::text,
    '/finance/providers.html'::text,3,v.created_at
  from public.fin_providers v where v.organization_id=p_org and (p_kind is null or p_kind='provider')
   and (position(v_query in lower(v.name))>0 or position(v_query in lower(v.id::text))>0)
  union all
  select 'contract'::text,c.id,coalesce(v.name,'Contrato')::text,c.ends_on::text,
    '/finance/contracts.html'::text,4,c.created_at
  from public.fin_contracts c left join public.fin_providers v on v.id=c.provider_id and v.organization_id=p_org
  where c.organization_id=p_org and (p_kind is null or p_kind='contract')
   and public.fin_entity_visible(p_org, c.legal_entity_id)
   and (position(v_query in lower(coalesce(v.name,'')))>0 or position(v_query in lower(c.id::text))>0)
  union all
  select 'task'::text,t.id,t.title::text,coalesce(t.due_on::text,'')::text,
    '/finance/dashboard.html'::text,5,t.created_at
  from public.fin_tasks t where t.organization_id=p_org and (p_kind is null or p_kind='task')
   and (public.fin_entity_visible(p_org, t.legal_entity_id) or (t.related_type is null and t.created_by = auth.uid()))
   and (position(v_query in lower(t.title))>0 or position(v_query in lower(t.id::text))>0)
 ) x order by x.priority,x.sorted_at desc,x.id limit p_limit offset p_offset;
end $$;

-- Autores de comentários: mesma regra de leitura dos comentários.
create or replace function public.fin_comment_authors(p_type text, p_id uuid)
returns table(author_id uuid, display_name text, organization_name text, organization_kind text)
language sql stable security definer set search_path = '' as $$
  select distinct on (c.author_id) c.author_id, m.display_name, o.legal_name, o.kind
    from public.fin_comments c
    join public.fin_members m on m.user_id = c.author_id
    join public.fin_organizations o on o.id = m.organization_id
   where c.object_type = p_type and c.object_id = p_id
     and ((public.fin_has_role(c.organization_id) and public.fin_object_visible(c.organization_id, c.object_type, c.object_id))
          or (c.visibility = 'provider_visible' and public.fin_provider_reads_comment(c.organization_id, c.author_id, c.object_type, c.object_id)))
   order by c.author_id, (m.organization_id = c.organization_id) desc, m.created_at;
$$;

-- ------------------------------------------------- 6. RPCs de administração
create or replace function public.fin_create_legal_entity(
  p_org uuid, p_kind text, p_legal_name text, p_short_name text default null, p_tax_identifier text default null,
  p_country text default 'BR', p_currency text default 'BRL', p_parent uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.fin_has_role(p_org, array['admin']) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.fin_organizations o where o.id = p_org and o.kind = 'BUYER') then raise exception 'buyer organization required'; end if;
  if p_kind not in ('legal_entity','business_unit') then raise exception 'invalid legal entity'; end if;
  if p_kind = 'business_unit' and not exists (select 1 from public.fin_legal_entities e
       where e.organization_id = p_org and e.id = p_parent and e.kind = 'legal_entity' and e.status = 'active') then
    raise exception 'invalid legal entity';
  end if;
  if p_kind = 'legal_entity' and p_parent is not null then raise exception 'invalid legal entity'; end if;
  if p_tax_identifier is not null and p_tax_identifier !~ '^[0-9]{14}$' then raise exception 'invalid tax identifier'; end if;
  if exists (select 1 from public.fin_legal_entities e where e.organization_id = p_org and e.tax_identifier = p_tax_identifier) then
    raise exception 'legal entity conflict';
  end if;
  insert into public.fin_legal_entities(organization_id, kind, parent_id, legal_name, short_name, tax_identifier, country, currency, created_by)
  values (p_org, p_kind, p_parent, trim(p_legal_name), nullif(trim(coalesce(p_short_name,'')),''), p_tax_identifier,
          upper(coalesce(p_country,'BR')), upper(coalesce(p_currency,'BRL')), auth.uid())
  returning id into v_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata, legal_entity_id)
  values (p_org, 'legal_entity', v_id, 'legal_entity_created', auth.uid(), jsonb_build_object('kind', p_kind), v_id);
  return v_id;
exception when check_violation then raise exception 'invalid legal entity';
end $$;

create or replace function public.fin_update_legal_entity(
  p_entity uuid, p_legal_name text, p_short_name text default null, p_currency text default null, p_status text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v public.fin_legal_entities%rowtype;
begin
  select * into v from public.fin_legal_entities where id = p_entity for update;
  if not found or not public.fin_has_role(v.organization_id, array['admin']) then raise exception 'forbidden'; end if;
  if p_status is not null and p_status not in ('active','archived') then raise exception 'invalid legal entity'; end if;
  -- Arquivar não apaga: processos e contratos continuam lá, com histórico;
  -- a entidade só deixa de aceitar processos novos.
  if p_status = 'archived' and v.kind = 'legal_entity' and exists (
       select 1 from public.fin_legal_entities c where c.organization_id = v.organization_id and c.parent_id = v.id and c.status = 'active') then
    raise exception 'legal entity has active units';
  end if;
  update public.fin_legal_entities set
    legal_name = coalesce(nullif(trim(coalesce(p_legal_name,'')),''), legal_name),
    short_name = case when p_short_name is null then short_name else nullif(trim(p_short_name),'') end,
    currency = coalesce(upper(p_currency), currency),
    status = coalesce(p_status, status),
    archived_at = case when coalesce(p_status, status) = 'archived' then coalesce(archived_at, now()) else null end,
    updated_at = now()
  where id = p_entity;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata, legal_entity_id)
  values (v.organization_id, 'legal_entity', p_entity,
          case when p_status is not null and p_status <> v.status then 'legal_entity_' || p_status else 'legal_entity_updated' end,
          auth.uid(), jsonb_build_object('currency_changed', p_currency is not null and upper(p_currency) <> v.currency), p_entity);
exception when check_violation then raise exception 'invalid legal entity';
end $$;

create or replace function public.fin_set_base_currency(p_org uuid, p_currency text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.fin_has_role(p_org, array['admin']) then raise exception 'forbidden'; end if;
  if coalesce(p_currency,'') !~ '^[A-Z]{3}$' then raise exception 'invalid currency'; end if;
  update public.fin_organizations set base_currency = p_currency where id = p_org;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
  values (p_org, 'organization', p_org, 'base_currency_updated', auth.uid(), jsonb_build_object('currency', p_currency));
end $$;

-- Define o escopo de um membro de uma vez (substitui as concessões). Admin do
-- grupo não pode ser restrito; restringir exige ao menos uma entidade ativa.
create or replace function public.fin_set_member_entity_scope(p_org uuid, p_user uuid, p_scope text, p_entities uuid[] default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare v_role text; v_count integer;
begin
  if not public.fin_has_role(p_org, array['admin']) then raise exception 'forbidden'; end if;
  select role into v_role from public.fin_members where organization_id = p_org and user_id = p_user for update;
  if v_role is null then raise exception 'member not found'; end if;
  if p_scope not in ('group','entities') then raise exception 'invalid scope'; end if;
  if p_scope = 'entities' and v_role = 'admin' then raise exception 'invalid scope'; end if;
  v_count := coalesce(array_length(p_entities, 1), 0);
  if p_scope = 'entities' and (v_count = 0 or v_count > 200 or (select count(*) from public.fin_legal_entities e
      where e.organization_id = p_org and e.id = any(p_entities) and e.status = 'active') <> (select count(distinct x) from unnest(p_entities) x)) then
    raise exception 'invalid scope';
  end if;
  delete from public.fin_member_entity_grants where organization_id = p_org and user_id = p_user;
  update public.fin_members set entity_scope = p_scope where organization_id = p_org and user_id = p_user;
  if p_scope = 'entities' then
    insert into public.fin_member_entity_grants(organization_id, user_id, entity_id, granted_by)
    select distinct p_org, p_user, x, auth.uid() from unnest(p_entities) x;
  end if;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
  values (p_org, 'member', p_user, 'member_entity_scope_set', auth.uid(),
          jsonb_build_object('scope', p_scope, 'entities', case when p_scope = 'entities' then v_count else 0 end));
end $$;

-- Cria RFQ já na entidade. Delega às RPCs existentes (que validam papel,
-- produto, demanda e Passport) e só fixa a entidade, na mesma transação.
create or replace function public.fin_create_rfq_in_entity(
  p_org uuid, p_entity uuid, p_product text, p_title text, p_description text default null,
  p_demand jsonb default '{}'::jsonb, p_deadline date default null, p_usage jsonb default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_entity is null then raise exception 'invalid legal entity'; end if;
  perform set_config('arandu.legal_entity', p_entity::text, true);
  if p_usage is not null and jsonb_typeof(p_usage) = 'array' and jsonb_array_length(p_usage) > 0 then
    v_id := public.fin_create_rfq_from_passport(p_org, p_product, p_title, p_description, p_demand, p_deadline, p_usage);
  else
    v_id := public.fin_create_rfq(p_org, p_product, p_title, p_description, p_demand, p_deadline);
  end if;
  perform set_config('arandu.legal_entity', '', true);
  return v_id;
end $$;

-- Reatribui a entidade de uma RFQ antes da decisão. Depois da decisão o
-- escopo é fato do processo e não muda.
create or replace function public.fin_set_rfq_entity(p_rfq uuid, p_entity uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.fin_rfqs%rowtype;
begin
  select * into v from public.fin_rfqs where id = p_rfq for update;
  if not found then raise exception 'rfq not found'; end if;
  if not public.fin_entity_allows(v.organization_id, v.legal_entity_id, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if v.status not in ('draft','open','collecting','comparing') then raise exception 'invalid state'; end if;
  if p_entity is not null and not exists (select 1 from public.fin_legal_entities e
       where e.organization_id = v.organization_id and e.id = p_entity and e.status = 'active') then
    raise exception 'invalid legal entity';
  end if;
  if not public.fin_entity_allows(v.organization_id, p_entity, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if v.legal_entity_id is not distinct from p_entity then return; end if;
  perform set_config('arandu.entity_change', 'on', true);
  update public.fin_rfqs set legal_entity_id = p_entity, updated_at = now() where id = p_rfq;
  perform set_config('arandu.entity_change', '', true);
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata, legal_entity_id)
  values (v.organization_id, 'rfq', p_rfq, 'rfq_entity_changed', auth.uid(),
          jsonb_build_object('from', v.legal_entity_id, 'to', p_entity), p_entity);
end $$;

-- Contrato anterior a esta migration (sem entidade) pode ser atribuído uma vez,
-- por quem é do grupo. Contrato com entidade não muda de entidade: a mudança
-- material passa a ser aditivo (Contract Center v2).
create or replace function public.fin_assign_contract_entity(p_contract uuid, p_entity uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.fin_contracts%rowtype;
begin
  select * into v from public.fin_contracts where id = p_contract for update;
  if not found then raise exception 'contract not found'; end if;
  if not public.fin_has_role(v.organization_id, array['admin','finance_manager']) or public.fin_entity_scope(v.organization_id) <> 'group' then
    raise exception 'forbidden';
  end if;
  if v.legal_entity_id is not null then raise exception 'legal entity already assigned'; end if;
  if not exists (select 1 from public.fin_legal_entities e where e.organization_id = v.organization_id and e.id = p_entity and e.status = 'active') then
    raise exception 'invalid legal entity';
  end if;
  perform set_config('arandu.entity_change', 'on', true);
  update public.fin_contracts set legal_entity_id = p_entity, updated_at = now() where id = p_contract;
  update public.fin_tasks set legal_entity_id = p_entity where organization_id = v.organization_id and related_type = 'contract' and related_id = p_contract;
  perform set_config('arandu.entity_change', '', true);
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata, legal_entity_id)
  values (v.organization_id, 'contract', p_contract, 'contract_entity_assigned', auth.uid(), '{}'::jsonb, p_entity);
end $$;

-- Marcos de renovação: quem tem escopo restrito processa só os contratos das
-- suas entidades (o job agendado roda sem sessão e processa todos).
create or replace function public.fin_process_renewals(p_org uuid,p_day date default current_date)
returns integer language plpgsql security definer set search_path = '' as $$
declare c record;v_days integer;v_mark text;v_due date;v_task uuid;v_count integer:=0;v_inserted integer;
begin
 if not public.fin_has_role(p_org,array['admin','finance_manager']) then raise exception 'forbidden'; end if;
 if p_day is null or abs(p_day-current_date)>1 then raise exception 'invalid date'; end if;
 for c in select id,owner_id,ends_on,renewal_notice_days,status from public.fin_contracts
   where organization_id=p_org and status in ('active','renewing','expired') and ends_on<=p_day+180
     and public.fin_entity_visible(p_org,legal_entity_id)
   order by ends_on,id for update
 loop
  v_days:=c.ends_on-p_day;
  v_mark:=case when v_days<=0 then 'expired' when v_days<=7 then 'd7'
    when v_days<=30 then 'd30' when v_days<=60 then 'd60'
    when v_days<=90 then 'd90' when v_days<=120 then 'd120' else 'd180' end;
  v_due:=case when v_days<=0 then p_day else c.ends_on end;
  if exists(select 1 from public.fin_renewal_milestones where contract_id=c.id and milestone=v_mark) then continue; end if;
  insert into public.fin_tasks(organization_id,title,due_on,status,related_type,related_id,created_by)
   values(p_org,case when v_days<=0 then 'Revisar contrato vencido' else 'Revisar renovação de contrato' end,
    v_due,'open','contract',c.id,auth.uid()) returning id into v_task;
  insert into public.fin_renewal_milestones(organization_id,contract_id,milestone,task_id)
   values(p_org,c.id,v_mark,v_task) on conflict(contract_id,milestone) do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then delete from public.fin_tasks where id=v_task; continue; end if;
  insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
   values(p_org,'contract',c.id,'renewal_task_created',auth.uid(),jsonb_build_object('milestone',v_mark,'task_id',v_task));
  if c.owner_id<>auth.uid() then
   insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body)
    values(p_org,c.owner_id,'renewal_due','contract',c.id,v_task,'Contrato em revisão','Há uma tarefa de renovação para acompanhar.')
    on conflict(user_id,event_type,event_id) do nothing;
  end if;
  if v_days<=c.renewal_notice_days and c.status='active' then
   update public.fin_contracts set status='renewing',updated_at=now() where id=c.id;
  end if;
  v_count:=v_count+1;
 end loop;
 return v_count;
end $$;

-- A renovação a partir do contrato herda a entidade do contrato.
create or replace function public.fin_start_contract_rfq(p_contract uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c record;v_id uuid;
begin
 select ct.organization_id,ct.product,ct.id,ct.legal_entity_id,r.title,r.description,r.demand into c
 from public.fin_contracts ct join public.fin_decisions d on d.id=ct.decision_id
 join public.fin_rfqs r on r.id=d.rfq_id and r.organization_id=ct.organization_id
 where ct.id=p_contract for update of ct;
 if not found then raise exception 'contract not found'; end if;
 if not public.fin_entity_allows(c.organization_id,c.legal_entity_id,array['admin','finance_manager']) then raise exception 'forbidden'; end if;
 insert into public.fin_rfqs(organization_id,product,title,description,demand,owner_id,status,legal_entity_id)
 values(c.organization_id,c.product,left('Renovação: '||c.title,200),c.description,c.demand,auth.uid(),'draft',c.legal_entity_id)
 returning id into v_id;
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
 values(c.organization_id,'contract',c.id,'renewal_rfq_started',auth.uid(),jsonb_build_object('rfq_id',v_id));
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
 values(c.organization_id,'rfq',v_id,'rfq_created_from_contract',auth.uid(),jsonb_build_object('contract_id',c.id));
 return v_id;
end $$;

-- ------------------------------------------------- 7. privilégios
-- No Supabase, funções novas nascem com EXECUTE para anon/authenticated
-- (default privileges): revogar explicitamente e conceder só o necessário.
revoke all on function public.fin_rfq_entity_guard() from public, anon, authenticated;
revoke all on function public.fin_contract_entity_guard() from public, anon, authenticated;
revoke all on function public.fin_rfq_child_entity_guard() from public, anon, authenticated;
revoke all on function public.fin_approval_step_entity_guard() from public, anon, authenticated;
revoke all on function public.fin_task_entity_guard() from public, anon, authenticated;
revoke all on function public.fin_comment_entity_guard() from public, anon, authenticated;
revoke all on function public.fin_document_entity_guard() from public, anon, authenticated;
revoke all on function public.fin_event_entity_stamp() from public, anon, authenticated;
revoke all on function public.fin_assert_entity_write(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fin_object_legal_entity(text, uuid) from public, anon, authenticated;
-- Usadas pelas policies (avaliadas com o papel de quem consulta).
revoke all on function public.fin_entity_scope(uuid) from public, anon;
revoke all on function public.fin_entity_allows(uuid, uuid, text[]) from public, anon;
revoke all on function public.fin_entity_visible(uuid, uuid) from public, anon;
revoke all on function public.fin_object_visible(uuid, text, uuid) from public, anon;
revoke all on function public.fin_rfq_visible(uuid) from public, anon;
revoke all on function public.fin_contract_visible(uuid) from public, anon;
grant execute on function public.fin_entity_scope(uuid), public.fin_entity_allows(uuid, uuid, text[]),
  public.fin_entity_visible(uuid, uuid), public.fin_object_visible(uuid, text, uuid),
  public.fin_rfq_visible(uuid), public.fin_contract_visible(uuid) to authenticated, service_role;

revoke all on function public.fin_create_legal_entity(uuid, text, text, text, text, text, text, uuid) from public, anon;
revoke all on function public.fin_update_legal_entity(uuid, text, text, text, text) from public, anon;
revoke all on function public.fin_set_base_currency(uuid, text) from public, anon;
revoke all on function public.fin_set_member_entity_scope(uuid, uuid, text, uuid[]) from public, anon;
revoke all on function public.fin_create_rfq_in_entity(uuid, uuid, text, text, text, jsonb, date, jsonb) from public, anon;
revoke all on function public.fin_set_rfq_entity(uuid, uuid) from public, anon;
revoke all on function public.fin_assign_contract_entity(uuid, uuid) from public, anon;
grant execute on function public.fin_create_legal_entity(uuid, text, text, text, text, text, text, uuid),
  public.fin_update_legal_entity(uuid, text, text, text, text), public.fin_set_base_currency(uuid, text),
  public.fin_set_member_entity_scope(uuid, uuid, text, uuid[]),
  public.fin_create_rfq_in_entity(uuid, uuid, text, text, text, jsonb, date, jsonb),
  public.fin_set_rfq_entity(uuid, uuid), public.fin_assign_contract_entity(uuid, uuid) to authenticated, service_role;
revoke all on function public.fin_start_contract_rfq(uuid), public.fin_process_renewals(uuid, date) from public, anon;
grant execute on function public.fin_start_contract_rfq(uuid), public.fin_process_renewals(uuid, date) to authenticated, service_role;

insert into public.fin_settings (key, value) values ('schema_version', 'financial-multi-entity-1')
on conflict (key) do update set value = excluded.value, updated_at = now();

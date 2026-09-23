-- Arandu — Financial Procurement (B2B) v1.
--
-- Migration ADITIVA: nenhuma tabela, policy ou dado da vertical de Arte é
-- alterado ou removido. Reaplicável: todas as criações são idempotentes e as
-- policies são recriadas com drop-if-exists.
--
-- Fronteira de produto (ver docs/FINANCIAL_PRODUCT_BOUNDARIES.md): o schema
-- registra solicitações, propostas, decisões humanas e contratos. Ele não
-- movimenta recursos, não guarda saldo e não decide crédito.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- organizações

create table if not exists public.fin_organizations (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (length(legal_name) between 2 and 200),
  trade_name text check (trade_name is null or length(trade_name) <= 200),
  kind text not null check (kind in ('BUYER','PROVIDER')),
  country text not null default 'BR' check (country ~ '^[A-Z]{2}$'),
  tax_identifier text check (tax_identifier is null or tax_identifier ~ '^[0-9]{14}$'),
  sector text check (sector is null or length(sector) <= 120),
  revenue_band text check (revenue_band is null or revenue_band in ('ate_360k','360k_4_8m','4_8m_30m','30m_300m','acima_300m')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, kind)
);

create table if not exists public.fin_members (
  organization_id uuid not null references public.fin_organizations(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('admin','finance_manager','analyst','provider_user','viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.fin_member_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  email text not null,
  role text not null check (role in ('admin','finance_manager','analyst','provider_user','viewer')),
  token_hash text not null unique,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Perfil financeiro reutilizável entre RFQs. Um registro por campo, com
-- proveniência: quem informou, quando, com que origem e até quando vale.
create table if not exists public.fin_company_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]{1,48}$'),
  field_value text not null check (length(field_value) between 1 and 500),
  source text not null default 'declarado_pela_empresa'
    check (source in ('declarado_pela_empresa','documento_interno','extrato','contrato_vigente','outro')),
  status text not null default 'informado' check (status in ('informado','revisado','desatualizado')),
  valid_until date,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, field_key)
);

-- ------------------------------------------------------------------ provedores

create table if not exists public.fin_providers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  provider_organization_id uuid references public.fin_organizations(id),
  name text not null check (length(name) between 2 and 200),
  kind text not null check (kind in ('bank','fintech','acquirer','subacquirer','credit_provider','payment_provider','other')),
  website text check (website is null or website ~ '^https://'),
  contact_name text, contact_email text, contact_phone text,
  products text[] not null default '{}',
  region text,
  status text not null default 'active' check (status in ('active','paused','archived')),
  origin text not null default 'cadastrado_pela_empresa'
    check (origin in ('cadastrado_pela_empresa','indicacao','pesquisa_publica','outro')),
  -- Nenhuma afirmação regulatória sem evidência: o estado padrão declara que
  -- o registro NÃO foi verificado pelo Arandu.
  verification_state text not null default 'NAO_VERIFICADO'
    check (verification_state in ('NAO_VERIFICADO','EVIDENCIA_REGISTRADA')),
  regulator_authority text, regulator_registry text,
  regulator_evidence_url text check (regulator_evidence_url is null or regulator_evidence_url ~ '^https://'),
  regulator_checked_at date,
  notes text,
  created_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint fin_provider_evidence_required check (
    verification_state = 'NAO_VERIFICADO'
    or (regulator_authority is not null and regulator_registry is not null
        and regulator_evidence_url is not null and regulator_checked_at is not null)
  )
);

-- ------------------------------------------------------------------------ RFQ

create table if not exists public.fin_rfqs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  product text not null check (product in ('credit','acquiring')),
  title text not null check (length(title) between 3 and 200),
  description text check (description is null or length(description) <= 4000),
  status text not null default 'draft'
    check (status in ('draft','open','collecting','comparing','decided','contracted','closed','cancelled')),
  owner_id uuid not null references auth.users(id),
  response_deadline date,
  demand jsonb not null default '{}'::jsonb check (jsonb_typeof(demand) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (id, product),
  unique (organization_id, id, product)
);

create table if not exists public.fin_rfq_invites (
  id uuid primary key default gen_random_uuid(),
  buyer_organization_id uuid not null,
  rfq_id uuid not null,
  provider_id uuid not null,
  provider_organization_id uuid references public.fin_organizations(id),
  token_hash text not null unique,
  status text not null default 'invited' check (status in ('invited','accepted','declined','revoked','expired')),
  expires_at timestamptz not null default now() + interval '21 days',
  accepted_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (buyer_organization_id, id),
  unique (rfq_id, provider_id),
  unique (id, provider_organization_id),
  unique (buyer_organization_id, rfq_id, id),
  foreign key (buyer_organization_id, rfq_id) references public.fin_rfqs(organization_id, id),
  foreign key (buyer_organization_id, provider_id) references public.fin_providers(organization_id, id)
);

-- ------------------------------------------------------------------- propostas

create table if not exists public.fin_proposals (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null unique,
  rfq_id uuid not null,
  buyer_organization_id uuid not null,
  provider_id uuid not null,
  provider_organization_id uuid not null references public.fin_organizations(id),
  product text not null check (product in ('credit','acquiring')),
  status text not null default 'draft' check (status in ('draft','submitted','revised','withdrawn')),
  current_version integer not null default 0 check (current_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, provider_organization_id),
  unique (buyer_organization_id, id),
  unique (rfq_id, id),
  foreign key (invite_id, provider_organization_id) references public.fin_rfq_invites(id, provider_organization_id),
  foreign key (buyer_organization_id, rfq_id) references public.fin_rfqs(organization_id, id),
  foreign key (rfq_id, product) references public.fin_rfqs(id, product)
);

-- Versões são append-only: uma condição financeira enviada nunca é
-- sobrescrita em silêncio.
create table if not exists public.fin_proposal_versions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.fin_proposals(id),
  version integer not null check (version > 0),
  terms jsonb not null check (jsonb_typeof(terms) = 'object'),
  note text check (note is null or length(note) <= 1000),
  submitted_by uuid not null references auth.users(id),
  submitted_at timestamptz not null default now(),
  unique (proposal_id, version),
  unique (proposal_id, id)
);

-- ------------------------------------------------------- decisões e contratos

create table if not exists public.fin_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  rfq_id uuid not null,
  proposal_id uuid not null unique,
  decided_by uuid not null references auth.users(id),
  decided_at timestamptz not null default now(),
  criteria jsonb not null default '{}'::jsonb check (jsonb_typeof(criteria) = 'object'),
  rationale text check (rationale is null or length(rationale) <= 4000),
  -- Fotografia do momento da decisão: proposta escolhida e demais propostas
  -- existentes. É o audit trail que sustenta a decisão humana.
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  unique (organization_id, id),
  unique (organization_id, id, proposal_id),
  foreign key (organization_id, rfq_id) references public.fin_rfqs(organization_id, id),
  -- A proposta decidida tem de pertencer à mesma organização compradora E à
  -- mesma RFQ: as duas chaves compostas abaixo tornam isso inviolável.
  foreign key (organization_id, proposal_id) references public.fin_proposals(buyer_organization_id, id),
  foreign key (rfq_id, proposal_id) references public.fin_proposals(rfq_id, id)
);

create table if not exists public.fin_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  decision_id uuid not null,
  proposal_id uuid not null,
  provider_id uuid not null,
  product text not null check (product in ('credit','acquiring')),
  starts_on date not null,
  ends_on date not null,
  renewal_notice_days integer not null default 60 check (renewal_notice_days between 0 and 3650),
  auto_renew boolean not null default false,
  cost_summary text check (cost_summary is null or length(cost_summary) <= 1000),
  main_conditions text check (main_conditions is null or length(main_conditions) <= 4000),
  document_reference text check (document_reference is null or document_reference ~ '^https://'),
  owner_id uuid not null references auth.users(id),
  status text not null default 'active' check (status in ('active','renewing','expired','terminated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  unique (organization_id, id),
  foreign key (organization_id, decision_id, proposal_id) references public.fin_decisions(organization_id, id, proposal_id),
  foreign key (organization_id, provider_id) references public.fin_providers(organization_id, id)
);

-- --------------------------------------------- documentos, tarefas e eventos

-- MVP: referência documental apenas. Nenhum upload é aceito por este schema —
-- ver docs/FINANCIAL_MVP_RUNBOOK.md, seção "Limitações".
create table if not exists public.fin_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  entity_type text not null check (entity_type in ('rfq','proposal','contract','profile','provider')),
  entity_id uuid not null,
  title text not null check (length(title) between 2 and 200),
  reference_url text not null check (reference_url ~ '^https://'),
  note text check (note is null or length(note) <= 1000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table if not exists public.fin_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  title text not null check (length(title) between 2 and 200),
  due_on date,
  status text not null default 'open' check (status in ('open','done','cancelled')),
  related_type text check (related_type is null or related_type in ('rfq','proposal','contract')),
  related_id uuid,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

-- Eventos de observabilidade de produto. `metadata` guarda contagens e
-- identificadores, nunca termos financeiros.
create table if not exists public.fin_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  entity_type text not null check (length(entity_type) <= 40),
  entity_id uuid not null,
  event_type text not null check (length(event_type) <= 60),
  actor_id uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  happened_at timestamptz not null default now(),
  unique (organization_id, id)
);

create index if not exists fin_rfqs_org_status_idx on public.fin_rfqs (organization_id, status, created_at desc);
create index if not exists fin_invites_provider_idx on public.fin_rfq_invites (provider_organization_id, status);
create index if not exists fin_proposals_rfq_idx on public.fin_proposals (rfq_id, status);
create index if not exists fin_contracts_renewal_idx on public.fin_contracts (organization_id, ends_on);
create index if not exists fin_events_org_idx on public.fin_events (organization_id, happened_at desc);

-- ============================================================================
-- Funções de identidade e papéis
-- ============================================================================

create or replace function public.fin_has_role(p_org uuid, p_roles text[] default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.fin_members m
    where m.organization_id = p_org and m.user_id = auth.uid()
      and (p_roles is null or m.role = any(p_roles))
  );
$$;

-- Criar organização direto na tabela permitiria reivindicar a empresa de outro.
-- O bootstrap é atômico: cria a organização e já registra o autor como admin.
create or replace function public.fin_create_organization(p_name text, p_kind text, p_country text default 'BR')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 200
     or p_kind not in ('BUYER','PROVIDER')
     or coalesce(p_country,'') !~ '^[A-Z]{2}$' then
    raise exception 'invalid organization';
  end if;
  insert into public.fin_organizations (legal_name, kind, country, created_by)
    values (trim(p_name), p_kind, p_country, auth.uid()) returning id into v_id;
  insert into public.fin_members (organization_id, user_id, role) values (v_id, auth.uid(), 'admin');
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id)
    values (v_id, 'organization', v_id, 'organization_created', auth.uid());
  return v_id;
end $$;

create or replace function public.fin_invite_member(p_org uuid, p_email text, p_role text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if not public.fin_has_role(p_org, array['admin']) then raise exception 'forbidden'; end if;
  if coalesce(p_email,'') !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(p_email) > 254 then
    raise exception 'invalid email';
  end if;
  if p_role not in ('admin','finance_manager','analyst','provider_user','viewer') then raise exception 'invalid role'; end if;
  v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  insert into public.fin_member_invitations (organization_id, email, role, token_hash, created_by)
    values (p_org, lower(trim(p_email)), p_role, encode(sha256(convert_to(v_token,'UTF8')),'hex'), auth.uid());
  return v_token;
end $$;

create or replace function public.fin_accept_member_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_inv public.fin_member_invitations%rowtype; v_email text;
begin
  if auth.uid() is null or coalesce(p_token,'') !~ '^[0-9a-f]{64}$' then raise exception 'invalid invitation'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  select * into v_inv from public.fin_member_invitations
    where token_hash = encode(sha256(convert_to(p_token,'UTF8')),'hex')
      and accepted_at is null and expires_at > now()
    for update;
  if not found or v_inv.email is distinct from v_email then raise exception 'invalid invitation'; end if;
  insert into public.fin_members (organization_id, user_id, role)
    values (v_inv.organization_id, auth.uid(), v_inv.role)
    on conflict (organization_id, user_id) do nothing;
  update public.fin_member_invitations set accepted_at = now() where id = v_inv.id;
  return v_inv.organization_id;
end $$;

-- ============================================================================
-- Convite de provedor para RFQ (uso único, com expiração)
-- ============================================================================

create or replace function public.fin_invite_provider(p_rfq uuid, p_provider uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_status text; v_token text;
begin
  select organization_id, status into v_org, v_status from public.fin_rfqs where id = p_rfq;
  if v_org is null then raise exception 'rfq not found'; end if;
  if not public.fin_has_role(v_org, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if v_status not in ('draft','open','collecting') then raise exception 'invalid state'; end if;
  if not exists (select 1 from public.fin_providers p where p.id = p_provider and p.organization_id = v_org and p.status = 'active') then
    raise exception 'provider not found';
  end if;
  v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  insert into public.fin_rfq_invites (buyer_organization_id, rfq_id, provider_id, token_hash, created_by)
    values (v_org, p_rfq, p_provider, encode(sha256(convert_to(v_token,'UTF8')),'hex'), auth.uid());
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id)
    values (v_org, 'rfq', p_rfq, 'provider_invited', auth.uid());
  return v_token;
end $$;

-- O convite vincula a organização provedora do CHAMADOR. O cliente nunca
-- escolhe provider_organization_id: trocar de identidade é impossível por
-- construção, e o token é consumido na primeira aceitação.
create or replace function public.fin_accept_provider_invite(p_token text, p_provider_org uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_inv public.fin_rfq_invites%rowtype;
begin
  if auth.uid() is null or coalesce(p_token,'') !~ '^[0-9a-f]{64}$' then raise exception 'invalid invitation'; end if;
  if not public.fin_has_role(p_provider_org, array['admin','provider_user']) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.fin_organizations o where o.id = p_provider_org and o.kind = 'PROVIDER') then
    raise exception 'provider organization required';
  end if;
  select * into v_inv from public.fin_rfq_invites
    where token_hash = encode(sha256(convert_to(p_token,'UTF8')),'hex')
      and status = 'invited' and accepted_at is null and expires_at > now()
    for update;
  if not found then raise exception 'invalid invitation'; end if;
  if v_inv.buyer_organization_id = p_provider_org then raise exception 'invalid invitation'; end if;
  update public.fin_rfq_invites
    set status = 'accepted', accepted_at = now(), provider_organization_id = p_provider_org
    where id = v_inv.id;
  insert into public.fin_proposals (invite_id, rfq_id, buyer_organization_id, provider_id, provider_organization_id, product)
    select v_inv.id, v_inv.rfq_id, v_inv.buyer_organization_id, v_inv.provider_id, p_provider_org, r.product
    from public.fin_rfqs r where r.id = v_inv.rfq_id
    on conflict (invite_id) do nothing;
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id)
    values (v_inv.buyer_organization_id, 'rfq', v_inv.rfq_id, 'invite_accepted', auth.uid());
  return v_inv.id;
end $$;

-- ============================================================================
-- Envio e revisão de proposta (versionamento append-only)
-- ============================================================================

create or replace function public.fin_submit_proposal(p_proposal uuid, p_terms jsonb, p_note text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_row public.fin_proposals%rowtype; v_rfq_status text; v_version integer;
begin
  if jsonb_typeof(coalesce(p_terms,'null'::jsonb)) is distinct from 'object' then raise exception 'invalid terms'; end if;
  select * into v_row from public.fin_proposals where id = p_proposal for update;
  if not found then raise exception 'proposal not found'; end if;
  if not public.fin_has_role(v_row.provider_organization_id, array['admin','provider_user']) then raise exception 'forbidden'; end if;
  if v_row.status = 'withdrawn' then raise exception 'invalid state'; end if;
  select status into v_rfq_status from public.fin_rfqs where id = v_row.rfq_id;
  if v_rfq_status not in ('open','collecting') then raise exception 'rfq is not receiving proposals'; end if;
  v_version := v_row.current_version + 1;
  insert into public.fin_proposal_versions (proposal_id, version, terms, note, submitted_by)
    values (p_proposal, v_version, p_terms, p_note, auth.uid());
  update public.fin_proposals
    set current_version = v_version,
        status = case when v_version = 1 then 'submitted' else 'revised' end,
        updated_at = now()
    where id = p_proposal;
  update public.fin_rfqs set status = 'collecting', updated_at = now()
    where id = v_row.rfq_id and status = 'open';
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v_row.buyer_organization_id, 'proposal', p_proposal,
            case when v_version = 1 then 'proposal_submitted' else 'proposal_revised' end,
            auth.uid(), jsonb_build_object('version', v_version));
  return v_version;
end $$;

create or replace function public.fin_withdraw_proposal(p_proposal uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_row public.fin_proposals%rowtype;
begin
  select * into v_row from public.fin_proposals where id = p_proposal for update;
  if not found then raise exception 'proposal not found'; end if;
  if not public.fin_has_role(v_row.provider_organization_id, array['admin','provider_user']) then raise exception 'forbidden'; end if;
  if exists (select 1 from public.fin_decisions d where d.proposal_id = p_proposal) then raise exception 'decided proposal'; end if;
  update public.fin_proposals set status = 'withdrawn', updated_at = now() where id = p_proposal;
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id)
    values (v_row.buyer_organization_id, 'proposal', p_proposal, 'proposal_withdrawn', auth.uid());
end $$;

-- ============================================================================
-- Transições de estado (RFQ e contrato)
-- ============================================================================

create or replace function public.fin_transition(p_kind text, p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if p_kind = 'rfq' then
    select organization_id into v_org from public.fin_rfqs where id = p_id;
    if v_org is null then raise exception 'not found'; end if;
    if not public.fin_has_role(v_org, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
    update public.fin_rfqs set status = p_status, updated_at = now()
      where id = p_id and (status, p_status) in (
        ('draft','open'), ('draft','cancelled'),
        ('open','collecting'), ('open','cancelled'),
        ('collecting','comparing'), ('collecting','cancelled'),
        ('comparing','collecting'), ('comparing','cancelled'),
        ('decided','contracted'), ('decided','closed'),
        ('contracted','closed')
      );
  elsif p_kind = 'contract' then
    select organization_id into v_org from public.fin_contracts where id = p_id;
    if v_org is null then raise exception 'not found'; end if;
    if not public.fin_has_role(v_org, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
    update public.fin_contracts set status = p_status, updated_at = now()
      where id = p_id and (status, p_status) in (
        ('active','renewing'), ('active','expired'), ('active','terminated'),
        ('renewing','active'), ('renewing','expired'), ('renewing','terminated')
      );
  else
    raise exception 'invalid transition';
  end if;
  if not found then raise exception 'invalid transition'; end if;
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id)
    values (v_org, p_kind, p_id, p_kind || '_' || p_status, auth.uid());
end $$;

-- ============================================================================
-- Decisão humana com snapshot auditável
-- ============================================================================

-- A decisão é sempre de uma pessoa da empresa compradora. A função apenas
-- registra a escolha e congela o que existia no momento — ela não escolhe nada.
create or replace function public.fin_record_decision(
  p_rfq uuid, p_proposal uuid, p_criteria jsonb default '{}'::jsonb, p_rationale text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_status text; v_snapshot jsonb; v_id uuid;
begin
  select organization_id, status into v_org, v_status from public.fin_rfqs where id = p_rfq;
  if v_org is null then raise exception 'rfq not found'; end if;
  if not public.fin_has_role(v_org, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if v_status not in ('collecting','comparing') then raise exception 'invalid state'; end if;
  if jsonb_typeof(coalesce(p_criteria,'null'::jsonb)) is distinct from 'object' then raise exception 'invalid criteria'; end if;
  if not exists (
    select 1 from public.fin_proposals p
    where p.id = p_proposal and p.rfq_id = p_rfq and p.buyer_organization_id = v_org
      and p.status in ('submitted','revised')
  ) then raise exception 'proposal not eligible'; end if;

  select jsonb_build_object(
    'decided_proposal_id', p_proposal,
    'captured_at', now(),
    'proposals', coalesce(jsonb_agg(jsonb_build_object(
      'proposal_id', p.id, 'provider_id', p.provider_id, 'status', p.status,
      'version', p.current_version, 'terms', v.terms, 'submitted_at', v.submitted_at
    ) order by p.created_at), '[]'::jsonb)
  ) into v_snapshot
  from public.fin_proposals p
  left join public.fin_proposal_versions v on v.proposal_id = p.id and v.version = p.current_version
  where p.rfq_id = p_rfq and p.buyer_organization_id = v_org and p.current_version > 0;

  insert into public.fin_decisions (organization_id, rfq_id, proposal_id, decided_by, criteria, rationale, snapshot)
    values (v_org, p_rfq, p_proposal, auth.uid(), coalesce(p_criteria,'{}'::jsonb), p_rationale, v_snapshot)
    returning id into v_id;
  update public.fin_rfqs set status = 'decided', updated_at = now() where id = p_rfq;
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id)
    values (v_org, 'rfq', p_rfq, 'decision_recorded', auth.uid());
  return v_id;
end $$;

create or replace function public.fin_register_contract(
  p_decision uuid, p_starts date, p_ends date, p_notice integer default 60,
  p_cost text default null, p_conditions text default null, p_reference text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_dec public.fin_decisions%rowtype; v_provider uuid; v_product text; v_id uuid;
begin
  select * into v_dec from public.fin_decisions where id = p_decision;
  if not found then raise exception 'decision not found'; end if;
  if not public.fin_has_role(v_dec.organization_id, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  select p.provider_id, p.product into v_provider, v_product from public.fin_proposals p where p.id = v_dec.proposal_id;
  insert into public.fin_contracts (organization_id, decision_id, proposal_id, provider_id, product,
      starts_on, ends_on, renewal_notice_days, cost_summary, main_conditions, document_reference, owner_id)
    values (v_dec.organization_id, p_decision, v_dec.proposal_id, v_provider, v_product,
      p_starts, p_ends, coalesce(p_notice,60), p_cost, p_conditions, p_reference, auth.uid())
    returning id into v_id;
  update public.fin_rfqs set status = 'contracted', updated_at = now()
    where id = v_dec.rfq_id and status = 'decided';
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id)
    values (v_dec.organization_id, 'contract', v_id, 'contract_registered', auth.uid());
  return v_id;
end $$;

revoke all on function
  public.fin_has_role(uuid, text[]),
  public.fin_create_organization(text, text, text),
  public.fin_invite_member(uuid, text, text),
  public.fin_accept_member_invitation(text),
  public.fin_invite_provider(uuid, uuid),
  public.fin_accept_provider_invite(text, uuid),
  public.fin_submit_proposal(uuid, jsonb, text),
  public.fin_withdraw_proposal(uuid),
  public.fin_transition(text, uuid, text),
  public.fin_record_decision(uuid, uuid, jsonb, text),
  public.fin_register_contract(uuid, date, date, integer, text, text, text)
  from public, anon;
grant execute on function
  public.fin_has_role(uuid, text[]),
  public.fin_create_organization(text, text, text),
  public.fin_invite_member(uuid, text, text),
  public.fin_accept_member_invitation(text),
  public.fin_invite_provider(uuid, uuid),
  public.fin_accept_provider_invite(text, uuid),
  public.fin_submit_proposal(uuid, jsonb, text),
  public.fin_withdraw_proposal(uuid),
  public.fin_transition(text, uuid, text),
  public.fin_record_decision(uuid, uuid, jsonb, text),
  public.fin_register_contract(uuid, date, date, integer, text, text, text)
  to authenticated, service_role;

-- Edição da demanda só enquanto a RFQ é rascunho, e por RPC: assim o cliente
-- nunca consegue alterar `status` por um UPDATE direto e pular a máquina de
-- estados.
create or replace function public.fin_update_rfq_demand(
  p_rfq uuid, p_title text, p_description text, p_demand jsonb, p_deadline date default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if jsonb_typeof(coalesce(p_demand,'null'::jsonb)) is distinct from 'object' then raise exception 'invalid demand'; end if;
  select organization_id into v_org from public.fin_rfqs where id = p_rfq;
  if v_org is null then raise exception 'not found'; end if;
  if not public.fin_has_role(v_org, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  update public.fin_rfqs
    set title = coalesce(nullif(trim(coalesce(p_title,'')),''), title),
        description = p_description, demand = p_demand, response_deadline = p_deadline, updated_at = now()
    where id = p_rfq and status in ('draft','open');
  if not found then raise exception 'invalid state'; end if;
end $$;
revoke all on function public.fin_update_rfq_demand(uuid, text, text, jsonb, date) from public, anon;
grant execute on function public.fin_update_rfq_demand(uuid, text, text, jsonb, date) to authenticated, service_role;

-- ============================================================================
-- RLS. O isolamento entre organizações é do banco, não da aplicação: mesmo um
-- chamador que fale direto com a REST API do Supabase não atravessa estas
-- policies. `anon` nunca recebe acesso a nenhuma destas tabelas.
-- ============================================================================

do $$ declare t text; begin
  foreach t in array array[
    'fin_organizations','fin_members','fin_member_invitations','fin_company_profiles','fin_providers',
    'fin_rfqs','fin_rfq_invites','fin_proposals','fin_proposal_versions','fin_decisions',
    'fin_contracts','fin_documents','fin_tasks','fin_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Leitura para membros; escrita direta apenas onde não há regra de estado.
grant select on public.fin_organizations, public.fin_members, public.fin_company_profiles,
  public.fin_providers, public.fin_rfqs, public.fin_rfq_invites, public.fin_proposals,
  public.fin_proposal_versions, public.fin_decisions, public.fin_contracts,
  public.fin_documents, public.fin_tasks, public.fin_events to authenticated;
grant insert, update on public.fin_company_profiles, public.fin_providers to authenticated;
grant insert on public.fin_documents, public.fin_tasks to authenticated;
grant update on public.fin_tasks to authenticated;

do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename like 'fin\_%' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

create policy fin_org_read on public.fin_organizations for select to authenticated
  using (public.fin_has_role(id));
create policy fin_member_read on public.fin_members for select to authenticated
  using (public.fin_has_role(organization_id));

create policy fin_profile_read on public.fin_company_profiles for select to authenticated
  using (public.fin_has_role(organization_id));
create policy fin_profile_write on public.fin_company_profiles for insert to authenticated
  with check (public.fin_has_role(organization_id, array['admin','finance_manager','analyst']) and updated_by = auth.uid());
create policy fin_profile_edit on public.fin_company_profiles for update to authenticated
  using (public.fin_has_role(organization_id, array['admin','finance_manager','analyst']))
  with check (public.fin_has_role(organization_id, array['admin','finance_manager','analyst']) and updated_by = auth.uid());

create policy fin_provider_read on public.fin_providers for select to authenticated
  using (public.fin_has_role(organization_id));
create policy fin_provider_write on public.fin_providers for insert to authenticated
  with check (public.fin_has_role(organization_id, array['admin','finance_manager']) and created_by = auth.uid());
create policy fin_provider_edit on public.fin_providers for update to authenticated
  using (public.fin_has_role(organization_id, array['admin','finance_manager']))
  with check (public.fin_has_role(organization_id, array['admin','finance_manager']));

-- A RFQ é lida pela empresa compradora e pelo provedor que ACEITOU o convite.
-- Um provedor jamais alcança RFQs de outro provedor ou de outra empresa.
create policy fin_rfq_read on public.fin_rfqs for select to authenticated
  using (
    public.fin_has_role(organization_id)
    or exists (select 1 from public.fin_rfq_invites i
               where i.rfq_id = fin_rfqs.id and i.status = 'accepted'
                 and i.provider_organization_id is not null
                 and public.fin_has_role(i.provider_organization_id))
  );

create policy fin_invite_read on public.fin_rfq_invites for select to authenticated
  using (
    public.fin_has_role(buyer_organization_id)
    or (provider_organization_id is not null and public.fin_has_role(provider_organization_id))
  );

-- Isolamento entre concorrentes: o provedor vê a própria proposta; a empresa
-- compradora vê todas as propostas da própria RFQ.
create policy fin_proposal_read on public.fin_proposals for select to authenticated
  using (public.fin_has_role(buyer_organization_id) or public.fin_has_role(provider_organization_id));

create policy fin_proposal_version_read on public.fin_proposal_versions for select to authenticated
  using (exists (select 1 from public.fin_proposals p
                 where p.id = fin_proposal_versions.proposal_id
                   and (public.fin_has_role(p.buyer_organization_id) or public.fin_has_role(p.provider_organization_id))));

create policy fin_decision_read on public.fin_decisions for select to authenticated
  using (public.fin_has_role(organization_id));
create policy fin_contract_read on public.fin_contracts for select to authenticated
  using (public.fin_has_role(organization_id));

create policy fin_document_read on public.fin_documents for select to authenticated
  using (public.fin_has_role(organization_id));
create policy fin_document_write on public.fin_documents for insert to authenticated
  with check (public.fin_has_role(organization_id, array['admin','finance_manager','analyst']) and created_by = auth.uid());

create policy fin_task_read on public.fin_tasks for select to authenticated
  using (public.fin_has_role(organization_id));
create policy fin_task_write on public.fin_tasks for insert to authenticated
  with check (public.fin_has_role(organization_id, array['admin','finance_manager','analyst']) and created_by = auth.uid());
create policy fin_task_edit on public.fin_tasks for update to authenticated
  using (public.fin_has_role(organization_id, array['admin','finance_manager','analyst']))
  with check (public.fin_has_role(organization_id, array['admin','finance_manager','analyst']));

create policy fin_event_read on public.fin_events for select to authenticated
  using (public.fin_has_role(organization_id));

-- Nenhum caminho de escrita direto para trilha, decisões, contratos, propostas,
-- convites e RFQs: tudo passa pelas funções acima, que validam papel e estado.
revoke insert, update, delete on public.fin_organizations, public.fin_members, public.fin_member_invitations,
  public.fin_rfqs, public.fin_rfq_invites, public.fin_proposals, public.fin_proposal_versions,
  public.fin_decisions, public.fin_contracts, public.fin_events from authenticated, anon;
revoke delete on public.fin_company_profiles, public.fin_providers, public.fin_documents, public.fin_tasks
  from authenticated, anon;

-- Criação de RFQ também é RPC: o estado inicial e o dono são fixados no banco.
create or replace function public.fin_create_rfq(
  p_org uuid, p_product text, p_title text, p_description text default null,
  p_demand jsonb default '{}'::jsonb, p_deadline date default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.fin_has_role(p_org, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if p_product not in ('credit','acquiring') then raise exception 'invalid product'; end if;
  if jsonb_typeof(coalesce(p_demand,'null'::jsonb)) is distinct from 'object' then raise exception 'invalid demand'; end if;
  if not exists (select 1 from public.fin_organizations o where o.id = p_org and o.kind = 'BUYER') then
    raise exception 'buyer organization required';
  end if;
  insert into public.fin_rfqs (organization_id, product, title, description, demand, response_deadline, owner_id)
    values (p_org, p_product, trim(p_title), p_description, coalesce(p_demand,'{}'::jsonb), p_deadline, auth.uid())
    returning id into v_id;
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (p_org, 'rfq', v_id, 'rfq_created', auth.uid(), jsonb_build_object('product', p_product));
  return v_id;
end $$;
revoke all on function public.fin_create_rfq(uuid, text, text, text, jsonb, date) from public, anon;
grant execute on function public.fin_create_rfq(uuid, text, text, text, jsonb, date) to authenticated, service_role;

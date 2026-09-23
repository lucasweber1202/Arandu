-- B2B platform v1. Additive: no Art tables or policies are changed.
create extension if not exists pgcrypto;

create table if not exists public.b2b_organizations (
  id uuid primary key default gen_random_uuid(), legal_name text not null check (length(legal_name) between 2 and 200),
  trade_name text, kind text not null check (kind in ('EXPORTER','MANUFACTURER','SUPPLIER','FINANCIAL_BUYER','FINANCIAL_PROVIDER','CONSULTANT','AUDITOR','OTHER')),
  country text not null default 'BR', tax_identifier text, created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), unique (id, kind)
);
create table if not exists public.b2b_members (
  organization_id uuid not null references public.b2b_organizations(id), user_id uuid not null references auth.users(id),
  role text not null check (role in ('admin','member','compliance_manager','compliance_reviewer','procurement_manager','finance_reviewer','provider_user','supplier_user','auditor','viewer')),
  created_at timestamptz not null default now(), primary key (organization_id,user_id)
);

-- Direct creation would let a user claim someone else's company. Bootstrap atomically.
create or replace function public.b2b_create_organization(p_name text, p_kind text, p_country text default 'BR')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if length(trim(p_name)) not between 2 and 200 or p_kind not in ('EXPORTER','MANUFACTURER','SUPPLIER','FINANCIAL_BUYER','FINANCIAL_PROVIDER','CONSULTANT','AUDITOR','OTHER') or p_country !~ '^[A-Z]{2}$' then
    raise exception 'invalid organization';
  end if;
  insert into public.b2b_organizations(legal_name,kind,country,created_by) values(trim(p_name),p_kind,p_country,auth.uid()) returning id into v_id;
  insert into public.b2b_members(organization_id,user_id,role) values(v_id,auth.uid(),'admin');
  return v_id;
end $$;

create or replace function public.b2b_has_role(p_org uuid, p_roles text[] default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.b2b_members m where m.organization_id=p_org and m.user_id=auth.uid()
      and (p_roles is null or m.role=any(p_roles))
  );
$$;
revoke all on function public.b2b_create_organization(text,text,text), public.b2b_has_role(uuid,text[]) from public, anon;
grant execute on function public.b2b_create_organization(text,text,text), public.b2b_has_role(uuid,text[]) to authenticated, service_role;

create table if not exists public.b2b_products (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.b2b_organizations(id),
  sku text not null, name text not null, description text, category text, brand text, manufacturer text,
  country_of_origin text, hs_code text, model text, batch text, serial text, market text,
  status text not null default 'draft' check(status in ('draft','review','published','archived')),
  composition jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  unique(organization_id,id), unique(organization_id,sku)
);
create table if not exists public.b2b_requirements (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.b2b_organizations(id),
  code text not null, title text not null, description text, vertical text not null check(vertical in ('export','finance')),
  jurisdiction text, source_url text, source_version text, effective_from date,
  verification_state text not null default 'PENDING_VERIFICATION' check(verification_state in ('PENDING_VERIFICATION','SOURCE_REVIEWED')),
  created_at timestamptz not null default now(), unique(organization_id,id), unique(organization_id,code,source_version)
);
create table if not exists public.b2b_documents (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.b2b_organizations(id),
  title text not null, document_type text not null, storage_path text, sha256 text check(sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  version integer not null default 1 check(version>0), issuer text, expires_at timestamptz,
  status text not null default 'pending_review' check(status in ('pending_review','verified','rejected','expired','superseded','revoked')),
  uploader_id uuid not null references auth.users(id), created_at timestamptz not null default now(), unique(organization_id,id)
);
create table if not exists public.b2b_product_requirements (
  organization_id uuid not null, product_id uuid not null, requirement_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(product_id,requirement_id), unique(organization_id,product_id,requirement_id),
  foreign key(organization_id,product_id) references public.b2b_products(organization_id,id),
  foreign key(organization_id,requirement_id) references public.b2b_requirements(organization_id,id)
);
create table if not exists public.b2b_evidence (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  product_id uuid not null, requirement_id uuid not null, document_id uuid not null,
  review_status text not null default 'pending' check(review_status in ('pending','accepted','rejected')),
  reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
  created_at timestamptz not null default now(), unique(organization_id,id),
  foreign key(organization_id,product_id,requirement_id) references public.b2b_product_requirements(organization_id,product_id,requirement_id),
  foreign key(organization_id,document_id) references public.b2b_documents(organization_id,id)
);
create table if not exists public.b2b_passports (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, product_id uuid not null,
  token uuid not null default gen_random_uuid() unique, published boolean not null default false,
  version integer not null default 1, created_at timestamptz not null default now(),
  unique(organization_id,id), unique(organization_id,product_id),
  foreign key(organization_id,product_id) references public.b2b_products(organization_id,id)
);
create table if not exists public.b2b_cbam_cases (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, product_id uuid not null,
  facility text not null, reporting_period daterange not null, importer text,
  emissions_data jsonb not null default '{}'::jsonb, methodology text, notes text,
  verification_state text not null default 'PENDING_VERIFICATION' check(verification_state in ('PENDING_VERIFICATION','REVIEWED')),
  created_at timestamptz not null default now(), unique(organization_id,id),
  foreign key(organization_id,product_id) references public.b2b_products(organization_id,id)
);
create table if not exists public.b2b_rfqs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.b2b_organizations(id),
  title text not null, category text not null check(category in ('credit','insurance','fx','acquiring','guarantee','leasing','other')),
  details jsonb not null default '{}'::jsonb, status text not null default 'draft' check(status in ('draft','open','closed')),
  created_at timestamptz not null default now(), unique(organization_id,id)
);
create table if not exists public.b2b_rfq_invitations (
  id uuid primary key default gen_random_uuid(), buyer_organization_id uuid not null, rfq_id uuid not null,
  provider_organization_id uuid not null references public.b2b_organizations(id),
  status text not null default 'invited' check(status in ('invited','declined','responded','revoked')),
  created_at timestamptz not null default now(), unique(buyer_organization_id,id), unique(id,provider_organization_id),
  unique(rfq_id,provider_organization_id), unique(buyer_organization_id,rfq_id,id),
  foreign key(buyer_organization_id,rfq_id) references public.b2b_rfqs(organization_id,id),
  check(buyer_organization_id<>provider_organization_id)
);
create table if not exists public.b2b_quotes (
  id uuid primary key default gen_random_uuid(), invitation_id uuid not null, provider_organization_id uuid not null,
  category text not null check(category in ('credit','insurance','fx','acquiring','guarantee','leasing','other')),
  terms jsonb not null, currency text, amount numeric, valid_until date,
  status text not null default 'submitted' check(status in ('submitted','withdrawn')),
  created_at timestamptz not null default now(), unique(invitation_id,id),
  foreign key(invitation_id,provider_organization_id) references public.b2b_rfq_invitations(id,provider_organization_id)
);
create table if not exists public.b2b_decisions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, rfq_id uuid not null,
  quote_id uuid not null unique, invitation_id uuid not null, decided_by uuid not null references auth.users(id),
  rationale text, created_at timestamptz not null default now(), unique(organization_id,id), unique(organization_id,id,quote_id),
  foreign key(organization_id,rfq_id) references public.b2b_rfqs(organization_id,id),
  foreign key(organization_id,rfq_id,invitation_id) references public.b2b_rfq_invitations(buyer_organization_id,rfq_id,id),
  foreign key(invitation_id,quote_id) references public.b2b_quotes(invitation_id,id),
  foreign key(organization_id,invitation_id) references public.b2b_rfq_invitations(buyer_organization_id,id)
);
create table if not exists public.b2b_contracts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, decision_id uuid not null,
  quote_id uuid not null, starts_on date not null, ends_on date not null, renewal_notice_days integer not null default 90,
  status text not null default 'active' check(status in ('active','expired','terminated')),
  created_at timestamptz not null default now(), unique(organization_id,id),
  foreign key(organization_id,decision_id,quote_id) references public.b2b_decisions(organization_id,id,quote_id),
  check(ends_on>=starts_on), check(renewal_notice_days between 0 and 3650)
);
create table if not exists public.b2b_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.b2b_organizations(id),
  entity_type text not null, entity_id uuid not null, event_type text not null,
  actor_id uuid not null references auth.users(id), happened_at timestamptz not null default now(),
  unique(organization_id,id)
);

-- RLS is enforced even when callers use the REST API directly. Never grant anon table access.
do $$ declare t text; begin
  foreach t in array array['b2b_organizations','b2b_members','b2b_products','b2b_requirements','b2b_documents','b2b_product_requirements','b2b_evidence','b2b_passports','b2b_cbam_cases','b2b_rfqs','b2b_rfq_invitations','b2b_quotes','b2b_decisions','b2b_contracts','b2b_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select, insert, update on public.%I to authenticated',t);
  end loop;
end $$;
create policy b2b_org_read on public.b2b_organizations for select to authenticated using (public.b2b_has_role(id));
create policy b2b_member_read on public.b2b_members for select to authenticated using (public.b2b_has_role(organization_id));
-- Membership changes require a separate audited administration path; no client writes.
do $$ declare t text; begin
  foreach t in array array['b2b_organizations','b2b_members'] loop
    execute format('revoke insert, update on public.%I from authenticated',t);
  end loop;
end $$;
do $$ declare t text; begin
  foreach t in array array['b2b_products','b2b_requirements','b2b_documents','b2b_product_requirements','b2b_evidence','b2b_passports','b2b_cbam_cases','b2b_rfqs','b2b_decisions','b2b_contracts','b2b_events'] loop
    execute format('create policy b2b_read on public.%I for select to authenticated using (public.b2b_has_role(organization_id))',t);
    execute format('create policy b2b_write on public.%I for insert to authenticated with check (public.b2b_has_role(organization_id, array[''admin'',''compliance_manager'',''procurement_manager'']))',t);
    execute format('create policy b2b_edit on public.%I for update to authenticated using (public.b2b_has_role(organization_id, array[''admin'',''compliance_manager'',''procurement_manager''])) with check (public.b2b_has_role(organization_id, array[''admin'',''compliance_manager'',''procurement_manager'']))',t);
  end loop;
end $$;
drop policy b2b_write on public.b2b_documents;
create policy b2b_document_create on public.b2b_documents for insert to authenticated with check
  (public.b2b_has_role(organization_id,array['admin','compliance_manager']) and uploader_id=auth.uid() and status='pending_review' and storage_path is null and version=1);
drop policy b2b_write on public.b2b_evidence;
create policy b2b_evidence_create on public.b2b_evidence for insert to authenticated with check
  (public.b2b_has_role(organization_id,array['admin','compliance_manager']) and review_status='pending' and reviewed_by is null and reviewed_at is null);
drop policy b2b_write on public.b2b_passports;
create policy b2b_passport_create on public.b2b_passports for insert to authenticated with check
  (public.b2b_has_role(organization_id,array['admin','compliance_manager']) and published=false and version=1);
drop policy b2b_write on public.b2b_rfqs;
create policy b2b_rfq_create on public.b2b_rfqs for insert to authenticated with check
  (public.b2b_has_role(organization_id,array['admin','procurement_manager']) and status='draft');
drop policy b2b_write on public.b2b_decisions;
create policy b2b_decision_create on public.b2b_decisions for insert to authenticated with check
  (public.b2b_has_role(organization_id,array['admin','procurement_manager']) and decided_by=auth.uid());
drop policy b2b_write on public.b2b_events;
create policy b2b_event_create on public.b2b_events for insert to authenticated with check
  (public.b2b_has_role(organization_id,array['admin','compliance_manager','procurement_manager']) and actor_id=auth.uid());
create policy b2b_invitation_read on public.b2b_rfq_invitations for select to authenticated using
  (public.b2b_has_role(buyer_organization_id) or public.b2b_has_role(provider_organization_id));
create policy b2b_invitation_write on public.b2b_rfq_invitations for insert to authenticated with check
  (public.b2b_has_role(buyer_organization_id,array['admin','procurement_manager']));
create policy b2b_rfq_invited_read on public.b2b_rfqs for select to authenticated using
  (exists(select 1 from public.b2b_rfq_invitations i where i.rfq_id=b2b_rfqs.id and public.b2b_has_role(i.provider_organization_id)));
create policy b2b_quote_read on public.b2b_quotes for select to authenticated using
  (public.b2b_has_role(provider_organization_id) or exists(select 1 from public.b2b_rfq_invitations i where i.id=invitation_id and public.b2b_has_role(i.buyer_organization_id)));
create policy b2b_quote_write on public.b2b_quotes for insert to authenticated with check
  (status='submitted' and public.b2b_has_role(provider_organization_id,array['admin','provider_user']) and
   exists(select 1 from public.b2b_rfq_invitations i join public.b2b_rfqs r on r.id=i.rfq_id where i.id=b2b_quotes.invitation_id and i.provider_organization_id=b2b_quotes.provider_organization_id and i.status='invited' and r.status='open' and r.category=b2b_quotes.category));
-- No UPDATE of quotes, decisions, events or evidence: records are append-only in MVP.
revoke update on public.b2b_products, public.b2b_requirements, public.b2b_documents, public.b2b_product_requirements,
  public.b2b_evidence, public.b2b_passports, public.b2b_cbam_cases, public.b2b_rfqs, public.b2b_rfq_invitations,
  public.b2b_quotes, public.b2b_decisions, public.b2b_contracts, public.b2b_events from authenticated;

create or replace function public.b2b_transition(p_kind text,p_id uuid,p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if p_kind='document' and p_status in ('verified','rejected') then
    select organization_id into v_org from public.b2b_documents where id=p_id;
    if not public.b2b_has_role(v_org,array['admin','compliance_reviewer']) then raise exception 'forbidden'; end if;
    update public.b2b_documents set status=p_status where id=p_id and status='pending_review';
  elsif p_kind='evidence' and p_status in ('accepted','rejected') then
    select organization_id into v_org from public.b2b_evidence where id=p_id;
    if not public.b2b_has_role(v_org,array['admin','compliance_reviewer']) then raise exception 'forbidden'; end if;
    update public.b2b_evidence set review_status=p_status, reviewed_by=auth.uid(), reviewed_at=now() where id=p_id and review_status='pending';
  elsif p_kind='passport' and p_status='published' then
    select organization_id into v_org from public.b2b_passports where id=p_id;
    if not public.b2b_has_role(v_org,array['admin','compliance_manager']) then raise exception 'forbidden'; end if;
    update public.b2b_passports set published=true where id=p_id and published=false;
  elsif p_kind='rfq' and p_status='open' then
    select organization_id into v_org from public.b2b_rfqs where id=p_id;
    if not public.b2b_has_role(v_org,array['admin','procurement_manager']) then raise exception 'forbidden'; end if;
    update public.b2b_rfqs set status='open' where id=p_id and status='draft';
  else raise exception 'invalid transition'; end if;
  if not found then raise exception 'not found or invalid state'; end if;
  insert into public.b2b_events(organization_id,entity_type,entity_id,event_type,actor_id)
    values(v_org,p_kind,p_id,p_status,auth.uid());
end $$;
revoke all on function public.b2b_transition(text,uuid,text) from public, anon;
grant execute on function public.b2b_transition(text,uuid,text) to authenticated, service_role;

-- Public passport view is a SECURITY DEFINER projection with an explicit allowlist.
create or replace function public.b2b_public_passport(p_token uuid)
returns table(product_name text, sku text, manufacturer text, country_of_origin text, passport_version integer, data_readiness integer)
language sql stable security definer set search_path = '' as $$
  select p.name,p.sku,p.manufacturer,p.country_of_origin,pp.version,
    case when count(pr.requirement_id)=0 then 0 else
      (100 * count(pr.requirement_id) filter(where exists (
        select 1 from public.b2b_evidence e join public.b2b_documents d on d.id=e.document_id
        where e.product_id=p.id and e.requirement_id=pr.requirement_id and e.review_status='accepted'
          and d.status='verified' and (d.expires_at is null or d.expires_at>now())
      )) / count(pr.requirement_id))::integer end
  from public.b2b_passports pp join public.b2b_products p on (p.id=pp.product_id and p.organization_id=pp.organization_id)
    left join public.b2b_product_requirements pr on pr.product_id=p.id
  where pp.token=p_token and pp.published=true
  group by p.id,pp.id;
$$;
revoke all on function public.b2b_public_passport(uuid) from public;
grant execute on function public.b2b_public_passport(uuid) to anon, authenticated, service_role;

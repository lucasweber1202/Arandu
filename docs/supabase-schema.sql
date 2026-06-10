-- Arandu Plataforma v1
-- Schema base para Supabase/PostgreSQL.
-- Aplicar em um projeto Supabase antes de ativar operação comercial.

create extension if not exists pgcrypto;

create table if not exists artists (
  id text primary key,
  name text not null,
  legal_name text,
  slug text unique,
  city text,
  state text,
  region text,
  languages text[] default '{}',
  curatorial_axes text[] default '{}',
  profile text,
  trajectory text,
  statement text,
  portfolio_url text,
  instagram text,
  status text default 'in_review' check (status in ('prospected','in_review','approved','published','paused','archived')),
  artist_level text default 'emerging' check (artist_level in ('emerging','developing','established')),
  image_url text,
  studio_image_url text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists artworks (
  id text primary key,
  slug text unique,
  title text not null,
  artist_id text not null references artists(id),
  language text,
  type text,
  technique text,
  support text,
  year text,
  dimensions text,
  price numeric,
  price_label text,
  status text default 'available' check (status in ('available','in_conversation','reserved','sold','not_published','archived')),
  edition text,
  edition_size integer,
  certificate boolean default true,
  thumb text,
  main_image_url text,
  detail_image_url text,
  room_image_url text,
  recommended_for text[] default '{}',
  tags text[] default '{}',
  moods text[] default '{}',
  spaces text[] default '{}',
  search text,
  summary text,
  curatorial_reading text,
  first_artwork boolean default false,
  logistics jsonb default '{}'::jsonb,
  payload jsonb default '{}'::jsonb,
  published boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists certificates (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  verification_status text default 'draft' check (verification_status in ('draft','valid','under_review','revoked')),
  artwork_id text references artworks(id),
  artist_id text references artists(id),
  issued_to text,
  issued_email text,
  issued_at timestamptz,
  certificate_hash text,
  certificate_notes text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  type text default 'contato',
  name text,
  email text,
  whatsapp text,
  company text,
  message text,
  source_page text,
  status text default 'new' check (status in ('new','contacted','qualified','proposal','won','lost','archived')),
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists artist_submissions (
  id uuid primary key default gen_random_uuid(),
  name text,
  artist_name text,
  city text,
  state text,
  portfolio_url text,
  instagram text,
  email text,
  whatsapp text,
  languages text,
  price_range text,
  message text,
  status text default 'received' check (status in ('received','screening','curatorial_review','approved','declined','archived')),
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists company_briefs (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  whatsapp text,
  company text,
  project_type text,
  environment text,
  budget text,
  deadline text,
  message text,
  source_page text,
  status text default 'received' check (status in ('received','qualified','proposal','negotiation','won','lost','archived')),
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists saved_selections (
  id uuid primary key default gen_random_uuid(),
  public_token text unique default encode(gen_random_bytes(8), 'hex'),
  lead_id uuid references leads(id),
  name text,
  email text,
  whatsapp text,
  items jsonb default '[]'::jsonb,
  briefing jsonb default '{}'::jsonb,
  status text default 'open' check (status in ('open','sent','reviewed','converted','archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  artwork_id text references artworks(id),
  lead_id uuid references leads(id),
  name text,
  whatsapp text,
  deadline text,
  notes text,
  status text default 'requested' check (status in ('requested','confirmed','expired','cancelled','converted')),
  expires_at timestamptz,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  proposal_number text unique default ('ARD-PROP-' || to_char(now(), 'YYYYMMDD') || '-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 6)),
  lead_id uuid references leads(id),
  company_brief_id uuid references company_briefs(id),
  client text,
  space text,
  goal text,
  budget text,
  deadline text,
  notes text,
  total numeric,
  status text default 'draft' check (status in ('draft','sent','approved','declined','expired','archived')),
  public_token text unique default encode(gen_random_bytes(8), 'hex'),
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references proposals(id) on delete cascade,
  artwork_id text references artworks(id),
  position integer default 1,
  price numeric,
  note text,
  created_at timestamptz default now()
);

create table if not exists crm_notes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  author_name text default 'Curadoria',
  note text not null,
  created_at timestamptz default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  entity_type text,
  entity_id text,
  title text not null,
  owner_name text,
  due_at timestamptz,
  priority text default 'normal' check (priority in ('low','normal','high')),
  status text default 'open' check (status in ('open','doing','done','cancelled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists artwork_events (
  id uuid primary key default gen_random_uuid(),
  artwork_id text references artworks(id),
  event_type text not null,
  note text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  entity_type text,
  entity_id text,
  asset_type text default 'image',
  url text not null,
  alt text,
  position integer default 1,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists newsletter_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  source_page text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_artworks_artist_id on artworks(artist_id);
create index if not exists idx_artworks_status on artworks(status);
create index if not exists idx_artworks_published on artworks(published);
create index if not exists idx_certificates_code on certificates(code);
create index if not exists idx_reservations_artwork_id on reservations(artwork_id);
create index if not exists idx_proposal_items_proposal_id on proposal_items(proposal_id);
create index if not exists idx_tasks_entity on tasks(entity_type, entity_id);

create or replace view v_artworks_full as
select
  a.*,
  ar.name as artist_name,
  ar.city as artist_city,
  ar.region as artist_region,
  ar.languages as artist_languages
from artworks a
join artists ar on ar.id = a.artist_id;

create or replace view v_public_catalog as
select * from v_artworks_full
where published = true and status in ('available','in_conversation','reserved','sold');

create or replace view v_available_artworks as
select * from v_artworks_full
where published = true and status = 'available';

create or replace view v_quality_issues as
select 'artwork_without_artist' as issue_type, a.id as entity_id, a.title as label
from artworks a
left join artists ar on ar.id = a.artist_id
where ar.id is null
union all
select 'artwork_without_tags' as issue_type, id as entity_id, title as label
from artworks
where array_length(tags, 1) is null or array_length(tags, 1) < 3
union all
select 'artist_without_profile' as issue_type, id as entity_id, name as label
from artists
where coalesce(profile, '') = '' or coalesce(trajectory, '') = '';

create or replace view v_sales_pipeline as
select 'lead' as source, id::text, name, status, created_at from leads
union all
select 'brief' as source, id::text, company as name, status, created_at from company_briefs
union all
select 'reservation' as source, id::text, name, status, created_at from reservations
union all
select 'proposal' as source, id::text, client as name, status, created_at from proposals;

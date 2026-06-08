-- Arandu — schema inicial para futura migração ao Supabase

create table if not exists artists (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  city text,
  state text,
  bio text,
  languages text[] default '{}',
  labels text[] default '{}',
  created_at timestamptz default now()
);

create table if not exists artworks (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  artist_id uuid references artists(id),
  title text not null,
  year integer,
  technique text,
  dimensions text,
  price_cents integer,
  currency text default 'BRL',
  status text default 'available',
  edition_type text,
  context_tags text[] default '{}',
  curatorial_note text,
  created_at timestamptz default now()
);

create table if not exists collections (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text,
  created_at timestamptz default now()
);

create table if not exists artwork_collections (
  artwork_id uuid references artworks(id) on delete cascade,
  collection_id uuid references collections(id) on delete cascade,
  primary key (artwork_id, collection_id)
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  name text,
  email text,
  whatsapp text,
  message text,
  source_page text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists artist_submissions (
  id uuid primary key default gen_random_uuid(),
  name text,
  artist_name text,
  city text,
  state text,
  portfolio_url text,
  instagram text,
  languages text,
  price_range text,
  message text,
  status text default 'received',
  created_at timestamptz default now()
);

create table if not exists architect_briefs (
  id uuid primary key default gen_random_uuid(),
  name text,
  company text,
  email text,
  whatsapp text,
  project_type text,
  city text,
  environment text,
  budget text,
  deadline text,
  wall_dimensions text,
  references_url text,
  message text,
  status text default 'received',
  created_at timestamptz default now()
);

create table if not exists certificates (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  artwork_id uuid references artworks(id),
  issued_to text,
  issued_at timestamptz,
  verification_status text default 'valid',
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists saved_selections (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  items jsonb default '[]'::jsonb,
  notes text,
  created_at timestamptz default now()
);

-- Arandu — schema inicial para Supabase
-- Rodar no SQL Editor do Supabase.

create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  profile_type text default 'comprador',
  role text default 'user',
  phone text,
  company text,
  city text,
  state text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists artists (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  profile_id uuid references profiles(id),
  name text not null,
  city text,
  state text,
  bio text,
  languages text[] default '{}',
  labels text[] default '{}',
  status text default 'published',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
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
  image_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
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
  user_id uuid references profiles(id),
  type text not null,
  name text,
  email text,
  whatsapp text,
  message text,
  source_page text,
  status text default 'new',
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists artist_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
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
  user_id uuid references profiles(id),
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
  owner_id uuid references profiles(id),
  issued_to text,
  issued_at timestamptz,
  verification_status text default 'valid',
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists saved_selections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  lead_id uuid references leads(id),
  items jsonb default '[]'::jsonb,
  notes text,
  status text default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id),
  event_type text not null,
  entity_type text,
  entity_id uuid,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table profiles enable row level security;
alter table saved_selections enable row level security;
alter table certificates enable row level security;
alter table leads enable row level security;

create policy if not exists "profiles_select_own" on profiles for select using (auth.uid() = id);
create policy if not exists "profiles_update_own" on profiles for update using (auth.uid() = id);
create policy if not exists "selections_select_own" on saved_selections for select using (auth.uid() = user_id);
create policy if not exists "selections_insert_own" on saved_selections for insert with check (auth.uid() = user_id);
create policy if not exists "selections_update_own" on saved_selections for update using (auth.uid() = user_id);
create policy if not exists "certificates_select_own" on certificates for select using (auth.uid() = owner_id or owner_id is null);
create policy if not exists "leads_insert_public" on leads for insert with check (true);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, full_name, profile_type)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', coalesce(new.raw_user_meta_data->>'profile_type', 'comprador'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

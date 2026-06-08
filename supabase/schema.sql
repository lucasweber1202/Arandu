-- Arandu — schema operacional para Supabase
-- Rodar no SQL Editor do Supabase.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  profile_type text default 'comprador' check (profile_type in ('comprador','artista','empresa','arquiteto','curadoria','admin')),
  role text default 'user' check (role in ('user','curator','admin')),
  phone text,
  company text,
  city text,
  state text,
  consent_marketing boolean default false,
  consent_privacy boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists artists (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  profile_id uuid references profiles(id),
  name text not null,
  legal_name text,
  city text,
  state text,
  country text default 'Brasil',
  bio_short text,
  bio text,
  statement text,
  languages text[] default '{}',
  axes text[] default '{}',
  labels text[] default '{}',
  portfolio_url text,
  instagram text,
  email text,
  phone text,
  status text default 'draft' check (status in ('draft','screening','approved','published','paused','archived')),
  represented boolean default false,
  curatorial_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists artworks (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  artist_id uuid references artists(id) on delete set null,
  title text not null,
  year integer,
  language text check (language in ('pintura','fotografia','escultura','objeto','técnica mista','papel','gravura','instalação') or language is null),
  technique text,
  support text,
  dimensions text,
  width_cm numeric,
  height_cm numeric,
  depth_cm numeric,
  price_cents integer,
  currency text default 'BRL',
  status text default 'available' check (status in ('available','in_conversation','temporarily_reserved','sold','on_hold','not_published')),
  edition_type text,
  edition_number text,
  edition_total integer,
  context_tags text[] default '{}',
  curatorial_note text,
  provenance_note text,
  conservation_note text,
  image_url text,
  certificate_required boolean default true,
  published boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists artwork_images (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid references artworks(id) on delete cascade,
  image_url text not null,
  alt text,
  position integer default 0,
  is_primary boolean default false,
  created_at timestamptz default now()
);

create table if not exists collections (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text,
  status text default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists artwork_collections (
  artwork_id uuid references artworks(id) on delete cascade,
  collection_id uuid references collections(id) on delete cascade,
  primary key (artwork_id, collection_id)
);

create table if not exists certificates (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  artwork_id uuid references artworks(id) on delete set null,
  owner_id uuid references profiles(id) on delete set null,
  issued_to text,
  issued_at timestamptz,
  verification_status text default 'valid' check (verification_status in ('draft','valid','revoked','under_review')),
  criteria jsonb default '{}'::jsonb,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  type text not null,
  name text,
  email text,
  whatsapp text,
  company text,
  message text,
  source_page text,
  status text default 'new' check (status in ('new','qualified','in_conversation','proposal_sent','converted','archived')),
  priority text default 'normal' check (priority in ('low','normal','high')),
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists artist_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
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
  status text default 'received' check (status in ('received','screening','curatorial_review','approved','not_now','published','archived')),
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists company_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  name text,
  company text,
  email text,
  whatsapp text,
  project_type text,
  city text,
  state text,
  environment text,
  budget text,
  deadline text,
  wall_dimensions text,
  references_url text,
  message text,
  status text default 'received' check (status in ('received','reviewing','proposal_draft','proposal_sent','won','lost','archived')),
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists saved_selections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  title text default 'Minha seleção Arandu',
  items jsonb default '[]'::jsonb,
  notes text,
  reading jsonb default '{}'::jsonb,
  status text default 'draft' check (status in ('draft','sent_to_curator','in_review','proposal_sent','archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists newsletter_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  source_page text,
  status text default 'active' check (status in ('active','unsubscribed','bounced')),
  consent_marketing boolean default true,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists narratives (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  category text,
  excerpt text,
  body text,
  status text default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_type text not null,
  normalized_table text,
  normalized_id uuid,
  source_page text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_artists_status on artists(status);
create index if not exists idx_artworks_status on artworks(status);
create index if not exists idx_artworks_artist_id on artworks(artist_id);
create index if not exists idx_leads_status on leads(status);
create index if not exists idx_artist_submissions_status on artist_submissions(status);
create index if not exists idx_company_briefs_status on company_briefs(status);
create index if not exists idx_certificates_code on certificates(code);

create trigger profiles_updated_at before update on profiles for each row execute procedure public.set_updated_at();
create trigger artists_updated_at before update on artists for each row execute procedure public.set_updated_at();
create trigger artworks_updated_at before update on artworks for each row execute procedure public.set_updated_at();
create trigger collections_updated_at before update on collections for each row execute procedure public.set_updated_at();
create trigger certificates_updated_at before update on certificates for each row execute procedure public.set_updated_at();
create trigger leads_updated_at before update on leads for each row execute procedure public.set_updated_at();
create trigger artist_submissions_updated_at before update on artist_submissions for each row execute procedure public.set_updated_at();
create trigger company_briefs_updated_at before update on company_briefs for each row execute procedure public.set_updated_at();
create trigger saved_selections_updated_at before update on saved_selections for each row execute procedure public.set_updated_at();
create trigger newsletter_subscriptions_updated_at before update on newsletter_subscriptions for each row execute procedure public.set_updated_at();
create trigger narratives_updated_at before update on narratives for each row execute procedure public.set_updated_at();

alter table profiles enable row level security;
alter table saved_selections enable row level security;
alter table certificates enable row level security;
alter table leads enable row level security;
alter table artist_submissions enable row level security;
alter table company_briefs enable row level security;
alter table newsletter_subscriptions enable row level security;

drop policy if exists "profiles_select_own" on profiles;
create policy "profiles_select_own" on profiles for select using (auth.uid() = id);
drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);
drop policy if exists "selections_select_own" on saved_selections;
create policy "selections_select_own" on saved_selections for select using (auth.uid() = user_id);
drop policy if exists "selections_insert_own" on saved_selections;
create policy "selections_insert_own" on saved_selections for insert with check (auth.uid() = user_id);
drop policy if exists "selections_update_own" on saved_selections;
create policy "selections_update_own" on saved_selections for update using (auth.uid() = user_id);
drop policy if exists "certificates_select_visible" on certificates;
create policy "certificates_select_visible" on certificates for select using (owner_id is null or auth.uid() = owner_id);
drop policy if exists "leads_insert_public" on leads;
create policy "leads_insert_public" on leads for insert with check (true);
drop policy if exists "artist_submissions_insert_public" on artist_submissions;
create policy "artist_submissions_insert_public" on artist_submissions for insert with check (true);
drop policy if exists "company_briefs_insert_public" on company_briefs;
create policy "company_briefs_insert_public" on company_briefs for insert with check (true);
drop policy if exists "newsletter_insert_public" on newsletter_subscriptions;
create policy "newsletter_insert_public" on newsletter_subscriptions for insert with check (true);

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

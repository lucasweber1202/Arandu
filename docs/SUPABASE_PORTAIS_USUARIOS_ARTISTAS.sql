-- Tabelas complementares para perfis e portal do artista
-- Rodar depois do schema principal, se a operação decidir ativar perfis persistentes.

create table if not exists user_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid,
  email text,
  full_name text,
  profile_type text default 'comprador',
  intent text,
  budget text,
  preferred_language text,
  preferred_space text,
  notes text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists artist_price_reviews (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid,
  artist_name text,
  email text,
  artwork_title text,
  current_price text,
  suggested_price text,
  reason text,
  justification text,
  status text default 'received',
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_user_profiles_email on user_profiles(email);
create index if not exists idx_artist_price_reviews_email on artist_price_reviews(email);
create index if not exists idx_artist_price_reviews_status on artist_price_reviews(status);

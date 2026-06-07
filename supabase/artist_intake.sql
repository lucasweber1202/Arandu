create table artist_intake (
  id uuid primary key default gen_random_uuid(),
  artistic_name text not null,
  full_name text,
  city text,
  state text,
  portfolio_url text,
  short_bio text,
  created_at timestamptz default now()
);

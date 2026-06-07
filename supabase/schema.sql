create table artists (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  city text,
  state text,
  short_bio text,
  curatorial_text text,
  status text default 'curated',
  created_at timestamptz default now()
);

create table artworks (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  artist_id uuid references artists(id),
  year integer,
  category text,
  technique text,
  price numeric,
  price_label text,
  availability text default 'available',
  description text,
  curatorial_note text,
  created_at timestamptz default now()
);

create table buyer_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  environment text,
  budget text,
  message text,
  created_at timestamptz default now()
);

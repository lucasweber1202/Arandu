create table project_briefs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  project_type text,
  environment text,
  budget text,
  message text,
  created_at timestamptz default now()
);

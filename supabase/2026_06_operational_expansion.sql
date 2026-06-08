-- Arandu — expansão operacional
-- Rodar após schema.sql e seed.sql.

create table if not exists crm_notes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('lead','artist_submission','company_brief','selection','artist','artwork','certificate','proposal','reservation')),
  entity_id uuid not null,
  note text not null,
  author_name text,
  created_at timestamptz default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  entity_type text check (entity_type in ('lead','artist_submission','company_brief','selection','artist','artwork','certificate','proposal','reservation')),
  entity_id uuid,
  title text not null,
  description text,
  owner_name text,
  due_at timestamptz,
  status text default 'open' check (status in ('open','doing','done','cancelled')),
  priority text default 'normal' check (priority in ('low','normal','high')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,
  company_brief_id uuid references company_briefs(id) on delete set null,
  saved_selection_id uuid references saved_selections(id) on delete set null,
  title text not null,
  client_name text,
  client_email text,
  client_company text,
  status text default 'draft' check (status in ('draft','sent','viewed','negotiation','won','lost','archived')),
  total_cents integer default 0,
  currency text default 'BRL',
  valid_until date,
  notes text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references proposals(id) on delete cascade,
  artwork_id uuid references artworks(id) on delete set null,
  title text,
  artist_name text,
  price_cents integer,
  notes text,
  position integer default 0,
  created_at timestamptz default now()
);

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid references artworks(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  client_name text,
  client_email text,
  client_whatsapp text,
  status text default 'active' check (status in ('active','expired','converted','cancelled')),
  reserved_until timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists artwork_events (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid references artworks(id) on delete cascade,
  event_type text not null check (event_type in ('created','published','status_changed','reserved','sold','price_changed','certificate_issued','image_added','note_added')),
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  entity_type text check (entity_type in ('artist','artwork','certificate','narrative','proposal','site')),
  entity_id uuid,
  file_name text,
  file_url text not null,
  mime_type text,
  alt text,
  usage text,
  position integer default 0,
  created_at timestamptz default now()
);

create index if not exists idx_crm_notes_entity on crm_notes(entity_type, entity_id);
create index if not exists idx_tasks_status_due on tasks(status, due_at);
create index if not exists idx_proposals_status on proposals(status);
create index if not exists idx_reservations_status on reservations(status);
create index if not exists idx_artwork_events_artwork on artwork_events(artwork_id);
create index if not exists idx_media_assets_entity on media_assets(entity_type, entity_id);

create trigger tasks_updated_at before update on tasks for each row execute procedure public.set_updated_at();
create trigger proposals_updated_at before update on proposals for each row execute procedure public.set_updated_at();
create trigger reservations_updated_at before update on reservations for each row execute procedure public.set_updated_at();

alter table crm_notes enable row level security;
alter table tasks enable row level security;
alter table proposals enable row level security;
alter table proposal_items enable row level security;
alter table reservations enable row level security;
alter table artwork_events enable row level security;
alter table media_assets enable row level security;

-- Rotas administrativas usam service role. RLS pública permanece restritiva por padrão.

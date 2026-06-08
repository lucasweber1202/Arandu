-- Arandu — extensão operacional para propostas, reservas e tarefas
-- Rodar após supabase/schema.sql.

create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  client_name text,
  client_company text,
  total_cents integer,
  status text default 'draft' check (status in ('draft','sent','viewed','negotiation','won','lost','archived')),
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid references artworks(id) on delete set null,
  client_name text,
  client_whatsapp text,
  reserved_until timestamptz,
  status text default 'active' check (status in ('active','expired','converted','cancelled')),
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists operational_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  entity_type text,
  entity_id uuid,
  owner_name text,
  due_at timestamptz,
  status text default 'open' check (status in ('open','doing','done','cancelled')),
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_proposals_status on proposals(status);
create index if not exists idx_reservations_status on reservations(status);
create index if not exists idx_operational_tasks_status on operational_tasks(status);

create trigger proposals_updated_at before update on proposals for each row execute procedure public.set_updated_at();
create trigger reservations_updated_at before update on reservations for each row execute procedure public.set_updated_at();
create trigger operational_tasks_updated_at before update on operational_tasks for each row execute procedure public.set_updated_at();

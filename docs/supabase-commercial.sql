-- Arandu Comercial
-- Rodar depois de docs/supabase-schema.sql.

create table if not exists commercial_records (
  id uuid primary key default gen_random_uuid(),
  commercial_number text unique default ('ARD-COM-' || to_char(now(), 'YYYYMMDD') || '-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 6)),
  proposal_id uuid references proposals(id),
  reservation_id uuid references reservations(id),
  lead_id uuid references leads(id),
  client text not null,
  email text,
  whatsapp text,
  total numeric default 0,
  platform_fee_rate numeric default 0.25,
  platform_fee numeric default 0,
  artist_amount numeric default 0,
  status text default 'draft' check (status in ('draft','confirmed','completed','cancelled')),
  logistics_status text default 'pending',
  notes text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists commercial_items (
  id uuid primary key default gen_random_uuid(),
  commercial_record_id uuid references commercial_records(id) on delete cascade,
  artwork_id text references artworks(id),
  artist_id text references artists(id),
  position integer default 1,
  price numeric default 0,
  platform_fee numeric default 0,
  artist_amount numeric default 0,
  note text,
  created_at timestamptz default now()
);

create table if not exists consignments (
  id uuid primary key default gen_random_uuid(),
  artist_id text references artists(id),
  artwork_id text references artworks(id),
  commission_rate numeric default 0.25,
  status text default 'active' check (status in ('draft','active','paused','closed','cancelled')),
  start_at timestamptz default now(),
  end_at timestamptz,
  terms text,
  notes text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists logistics_records (
  id uuid primary key default gen_random_uuid(),
  commercial_record_id uuid references commercial_records(id) on delete cascade,
  artwork_id text references artworks(id),
  contact_name text,
  contact_whatsapp text,
  address text,
  city text,
  state text,
  carrier text,
  tracking_code text,
  status text default 'pending' check (status in ('pending','packing','shipped','delivered','returned','cancelled')),
  notes text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_commercial_records_status on commercial_records(status);
create index if not exists idx_commercial_records_lead on commercial_records(lead_id);
create index if not exists idx_commercial_items_record on commercial_items(commercial_record_id);
create index if not exists idx_commercial_items_artwork on commercial_items(artwork_id);
create index if not exists idx_consignments_artist on consignments(artist_id);
create index if not exists idx_consignments_artwork on consignments(artwork_id);
create index if not exists idx_consignments_status on consignments(status);
create index if not exists idx_logistics_records_commercial on logistics_records(commercial_record_id);
create index if not exists idx_logistics_records_status on logistics_records(status);

drop trigger if exists trg_commercial_records_updated_at on commercial_records;
create trigger trg_commercial_records_updated_at before update on commercial_records for each row execute function set_updated_at();

drop trigger if exists trg_consignments_updated_at on consignments;
create trigger trg_consignments_updated_at before update on consignments for each row execute function set_updated_at();

drop trigger if exists trg_logistics_records_updated_at on logistics_records;
create trigger trg_logistics_records_updated_at before update on logistics_records for each row execute function set_updated_at();

create or replace view v_commercial_pipeline as
select 'commercial' as source, id::text, client as name, status, created_at from commercial_records
union all
select 'logistics' as source, id::text, coalesce(contact_name, tracking_code, city) as name, status, created_at from logistics_records;

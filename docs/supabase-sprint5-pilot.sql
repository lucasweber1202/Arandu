-- Arandu — Sprint 5: telemetria e feedback do piloto fechado
-- Aplicar depois da migration do Sprint 2.

create table if not exists public.pilot_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('page_view','search','artwork_view','selection_add','reservation_start','reservation_complete','form_submit','pilot_task')),
  path text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pilot_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  task text,
  rating integer not null check (rating between 1 and 5),
  message text,
  contact_allowed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_pilot_events_created_at on public.pilot_events(created_at desc);
create index if not exists idx_pilot_events_session on public.pilot_events(session_id, created_at);
create index if not exists idx_pilot_events_type on public.pilot_events(event_type, created_at desc);
create index if not exists idx_pilot_feedback_created_at on public.pilot_feedback(created_at desc);
create index if not exists idx_pilot_feedback_session on public.pilot_feedback(session_id, created_at);

alter table public.pilot_events enable row level security;
alter table public.pilot_feedback enable row level security;

-- Não há policy pública: leitura e escrita passam exclusivamente pela API server-side.
revoke all on public.pilot_events from anon, authenticated;
revoke all on public.pilot_feedback from anon, authenticated;

comment on table public.pilot_events is 'Eventos minimizados e sem PII do piloto fechado Arandu.';
comment on table public.pilot_feedback is 'Feedback voluntário dos participantes do piloto fechado.';

-- Arandu — Sprint 1: propriedade de dados e segurança de contas
-- Rodar depois de docs/supabase-schema.sql e docs/supabase-production.sql.
-- Esta migration é idempotente e pode ser aplicada no banco de produção atual.

alter table public.leads
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.company_briefs
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.saved_selections
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.reservations
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.saved_selections
  alter column public_token set default encode(gen_random_bytes(16), 'hex');

create index if not exists idx_leads_user_id
  on public.leads(user_id, created_at desc);

create index if not exists idx_company_briefs_user_id
  on public.company_briefs(user_id, created_at desc);

create index if not exists idx_saved_selections_user_id
  on public.saved_selections(user_id, updated_at desc);

create index if not exists idx_reservations_user_id
  on public.reservations(user_id, created_at desc);

-- Vincula registros históricos quando o e-mail já identifica uma conta.
update public.leads as lead
set user_id = profile.id
from public.profiles as profile
where lead.user_id is null
  and lead.email is not null
  and lower(lead.email) = lower(profile.email);

update public.company_briefs as brief
set user_id = profile.id
from public.profiles as profile
where brief.user_id is null
  and brief.email is not null
  and lower(brief.email) = lower(profile.email);

update public.saved_selections as selection
set user_id = profile.id
from public.profiles as profile
where selection.user_id is null
  and selection.email is not null
  and lower(selection.email) = lower(profile.email);

update public.reservations as reservation
set user_id = lead.user_id
from public.leads as lead
where reservation.user_id is null
  and reservation.lead_id = lead.id
  and lead.user_id is not null;

alter table public.leads enable row level security;
alter table public.company_briefs enable row level security;
alter table public.saved_selections enable row level security;
alter table public.reservations enable row level security;

drop policy if exists leads_select_own on public.leads;
create policy leads_select_own on public.leads
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists company_briefs_select_own on public.company_briefs;
create policy company_briefs_select_own on public.company_briefs
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists reservations_select_own on public.reservations;
create policy reservations_select_own on public.reservations
  for select to authenticated
  using (auth.uid() = user_id);

-- Status e condições da reserva continuam sob controle da curadoria.
drop policy if exists reservations_update_own on public.reservations;

drop policy if exists selections_select_own on public.saved_selections;
create policy selections_select_own on public.saved_selections
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists selections_update_own on public.saved_selections;
create policy selections_update_own on public.saved_selections
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists selections_delete_own on public.saved_selections;
create policy selections_delete_own on public.saved_selections
  for delete to authenticated
  using (auth.uid() = user_id);

revoke update on public.profiles from authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- O compartilhamento público passa exclusivamente pela API, que devolve uma
-- representação sem nome, e-mail ou WhatsApp. Remover esta policy impede que
-- clientes consultem a tabela completa diretamente pelo token.
drop policy if exists selections_public_token_read on public.saved_selections;

comment on column public.leads.user_id is
  'Conta Supabase vinculada ao lead quando o contato está autenticado.';
comment on column public.saved_selections.user_id is
  'Proprietário autenticado da seleção; nulo para compartilhamentos de visitantes.';
comment on column public.reservations.user_id is
  'Conta que solicitou a reserva; nulo para reservas feitas como visitante.';
comment on column public.company_briefs.user_id is
  'Conta vinculada ao briefing empresarial quando disponível.';

-- Arandu — camada de produção Supabase
-- Rodar depois de docs/supabase-schema.sql
-- Objetivo: perfis de usuários, triggers e políticas básicas de segurança.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  profile_type text default 'comprador' check (profile_type in ('comprador','artista','empresa','arquiteto','curadoria','admin')),
  phone text,
  city text,
  state text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, profile_type)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
    case
      when new.raw_user_meta_data->>'profile_type' in ('comprador','artista','empresa','arquiteto')
        then new.raw_user_meta_data->>'profile_type'
      else 'comprador'
    end
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    profile_type = coalesce(excluded.profile_type, public.profiles.profile_type),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_auth_user_profile on auth.users;
create trigger trg_auth_user_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.artists enable row level security;
alter table public.artworks enable row level security;
alter table public.certificates enable row level security;
alter table public.leads enable row level security;
alter table public.artist_submissions enable row level security;
alter table public.company_briefs enable row level security;
alter table public.saved_selections enable row level security;
alter table public.reservations enable row level security;
alter table public.newsletter_subscriptions enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- A conta pode editar apenas dados de apresentação. Tipo de perfil e e-mail
-- continuam sob controle do backend/curadoria.
revoke update on public.profiles from authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

drop policy if exists artists_public_read on public.artists;
create policy artists_public_read on public.artists for select to anon, authenticated using (status = 'published');

drop policy if exists artworks_public_read on public.artworks;
create policy artworks_public_read on public.artworks for select to anon, authenticated using (published = true and status in ('available','in_conversation','reserved','sold'));

drop policy if exists certificates_public_valid_read on public.certificates;
create policy certificates_public_valid_read on public.certificates for select to anon, authenticated using (verification_status = 'valid');

drop policy if exists leads_public_insert on public.leads;
create policy leads_public_insert on public.leads for insert to anon, authenticated
  with check (
    (auth.uid() is null and user_id is null)
    or (auth.uid() is not null and auth.uid() = user_id)
  );

drop policy if exists leads_select_own on public.leads;
create policy leads_select_own on public.leads for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists artist_submissions_public_insert on public.artist_submissions;
create policy artist_submissions_public_insert on public.artist_submissions for insert to anon, authenticated with check (true);

drop policy if exists company_briefs_public_insert on public.company_briefs;
create policy company_briefs_public_insert on public.company_briefs for insert to anon, authenticated
  with check (
    (auth.uid() is null and user_id is null)
    or (auth.uid() is not null and auth.uid() = user_id)
  );

drop policy if exists company_briefs_select_own on public.company_briefs;
create policy company_briefs_select_own on public.company_briefs for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists reservations_public_insert on public.reservations;
create policy reservations_public_insert on public.reservations for insert to anon, authenticated
  with check (
    (auth.uid() is null and user_id is null)
    or (auth.uid() is not null and auth.uid() = user_id)
  );

drop policy if exists reservations_select_own on public.reservations;
create policy reservations_select_own on public.reservations for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists selections_public_insert on public.saved_selections;
create policy selections_public_insert on public.saved_selections for insert to anon, authenticated
  with check (
    (auth.uid() is null and user_id is null)
    or (auth.uid() is not null and auth.uid() = user_id)
  );

drop policy if exists selections_public_token_read on public.saved_selections;

drop policy if exists selections_select_own on public.saved_selections;
create policy selections_select_own on public.saved_selections for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists selections_update_own on public.saved_selections;
create policy selections_update_own on public.saved_selections for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists selections_delete_own on public.saved_selections;
create policy selections_delete_own on public.saved_selections for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists newsletter_public_insert on public.newsletter_subscriptions;
create policy newsletter_public_insert on public.newsletter_subscriptions for insert to anon, authenticated with check (true);

create index if not exists idx_profiles_profile_type on public.profiles(profile_type);
create index if not exists idx_profiles_email on public.profiles(email);

comment on table public.profiles is 'Perfis de usuários da Arandu vinculados ao Supabase Auth.';

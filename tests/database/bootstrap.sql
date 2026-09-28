\set ON_ERROR_STOP on

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then execute 'create role anon nologin'; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'create role authenticated nologin'; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then execute 'create role service_role nologin bypassrls'; end if;
end;
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  banned_until timestamptz,
  created_at timestamptz not null default now()
);
-- Como no Supabase: e-mail confirmado ou não. Contas de teste nascem confirmadas.
alter table auth.users add column if not exists email_confirmed_at timestamptz default now();

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema public, auth to anon, authenticated, service_role;
grant select on auth.users to service_role;

-- Espelho mínimo de storage.buckets do Supabase: permite provar que o bucket de
-- documentos nasce privado, com limite e lista de tipos.
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now()
);

-- Fidelidade ao Supabase hospedado: toda tabela, view, sequência e função nova
-- do schema public nasce com ALL para anon, authenticated e service_role, e o
-- pgcrypto mora no schema extensions. Sem isso, um `revoke ... from public`
-- parece suficiente aqui e deixa a função exposta lá (ver
-- docs/supabase-financial-pilot-surface-hardening.sql).
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create extension if not exists pgcrypto with schema extensions;
do $$ begin
  execute format('alter database %I set search_path = "$user", public, extensions', current_database());
end $$;
set search_path = "$user", public, extensions;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

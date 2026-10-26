-- Self-hosted platform roles on stock PostgreSQL. Auth and Storage create their
-- OWN real schemas/tables via their pinned service migrations (no auth mocks).
create role supabase_admin login superuser;
create role supabase_auth_admin login createrole;
create role supabase_storage_admin login;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator login noinherit;
grant anon,authenticated,service_role to authenticator;
create schema auth authorization supabase_auth_admin;
create schema storage authorization supabase_storage_admin;
create schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
grant usage on schema extensions,public to supabase_auth_admin,supabase_storage_admin,anon,authenticated,service_role;
grant create on schema public to supabase_auth_admin,supabase_storage_admin;
alter role supabase_auth_admin set search_path=auth,public,extensions;
alter role supabase_storage_admin set search_path=storage,public,extensions;
create function auth.uid() returns uuid language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid
$$;
create function auth.role() returns text language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'))
$$;
create function auth.jwt() returns jsonb language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
$$;
grant usage on schema auth to anon,authenticated,service_role;
grant execute on all functions in schema auth to anon,authenticated,service_role;
alter function auth.uid() owner to supabase_auth_admin;
alter function auth.role() owner to supabase_auth_admin;
alter function auth.jwt() owner to supabase_auth_admin;
grant create on database postgres to supabase_storage_admin,supabase_auth_admin;
alter role postgres set search_path=public,extensions;
-- Storage verifies the JWT, then SET LOCAL ROLE enforces that caller's RLS.
grant anon,authenticated,service_role to supabase_storage_admin;
alter role supabase_storage_admin noinherit;

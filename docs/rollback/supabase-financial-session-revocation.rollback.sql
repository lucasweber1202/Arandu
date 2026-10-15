-- Rollback de docs/supabase-financial-session-revocation.sql: remove o hook de
-- pré-requisição do PostgREST. O access token volta a valer na REST API até
-- expirar, mesmo depois do logout (R1 volta a ser risco aceito).
begin;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator reset pgrst.db_pre_request';
  end if;
end $$;
notify pgrst, 'reload config';
drop function if exists public.fin_request_session_guard();
drop function if exists public.fin_current_session_alive();

insert into public.fin_settings (key, value) values ('schema_version', 'financial-decision-integrity-1')
on conflict (key) do update set value = excluded.value, updated_at = now();

commit;

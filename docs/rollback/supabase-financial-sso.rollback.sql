-- Reverte docs/supabase-financial-sso.sql.
-- Conexões, domínios verificados e a trilha de tentativas de login são registro
-- de segurança do cliente: o rollback ABORTA se existir qualquer um deles.
-- Em produção prefira forward-fix (desativar a conexão com fin_sso_set_status
-- 'disabled', o que reabre o login por senha + MFA sem apagar histórico;
-- docs/FINANCIAL_SSO.md, seção Rollback). O código anterior ignora as tabelas.
do $$
begin
  if exists (select 1 from public.fin_sso_connections) or exists (select 1 from public.fin_sso_domains)
     or exists (select 1 from public.fin_sso_events) then
    raise exception 'rollback abortado: existe configuração ou trilha de SSO; desative, exporte e trate antes';
  end if;
end $$;

drop function if exists public.fin_record_sso_event(uuid, text, text, text, text, text);
drop function if exists public.fin_sso_session_valid(uuid, uuid, timestamptz);
drop function if exists public.fin_sso_authorize(uuid, uuid, text, text, timestamptz);
drop function if exists public.fin_sso_password_allowed(text);
drop function if exists public.fin_sso_discover(text);
drop function if exists public.fin_sso_revoke_sessions(uuid);
drop function if exists public.fin_sso_set_status(uuid, text, boolean);
drop function if exists public.fin_sso_link_domain(text, uuid);
drop function if exists public.fin_sso_mark_domain_verified(text, text);
drop function if exists public.fin_sso_claim_domain(uuid, text, text);
drop function if exists public.fin_sso_save_connection(uuid, uuid, text, text, text, text, text, text, text, jsonb, integer);
drop table if exists public.fin_sso_events;
drop table if exists public.fin_sso_domains;
drop table if exists public.fin_sso_connections;

insert into public.fin_settings (key, value) values ('schema_version', 'financial-public-api-1')
on conflict (key) do update set value = excluded.value, updated_at = now();

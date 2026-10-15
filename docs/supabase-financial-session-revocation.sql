-- Revogação de sessão no acesso direto ao PostgREST (Stage 0, R1 de
-- docs/QA_ADVERSARIAL_2026-10-14.md).
--
-- Depois do logout (ou de uma sessão encerrada pelo GoTrue), a API do Arandu e
-- o GoTrue recusavam o access token, mas o PostgREST continuava aceitando o
-- mesmo JWT até ele expirar (até 1 h): ele confere só a assinatura. Quem tivesse
-- copiado o cookie da sessão lia e escrevia direto na REST API nesse intervalo.
--
-- Correção: hook de pré-requisição do PostgREST (pgrst.db_pre_request), uma
-- busca por chave primária em auth.sessions por requisição, antes de qualquer
-- consulta. Token de usuário (role authenticated) sem sessão viva recebe 401;
-- anon e service_role não passam pela checagem (não têm sessão de usuário).
-- Não mexe em nenhuma policy nem RPC. Vale para toda chamada REST com JWT de
-- usuário, inclusive as que a própria API do Arandu faz em nome da pessoa.
--
-- Supabase hospedado: a configuração do authenticator é a forma documentada de
-- registrar o hook; o NOTIFY recarrega o PostgREST sem reinício.
-- Rollback em docs/rollback/supabase-financial-session-revocation.rollback.sql.
begin;

-- Sessão viva do próprio chamador (sem parâmetro: não serve de oráculo para
-- sessões alheias). Definer porque auth.sessions não é legível pela API.
create or replace function public.fin_current_session_alive()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_claims jsonb; v_session uuid;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    v_session := (v_claims->>'session_id')::uuid;
  exception when others then return false;
  end;
  return v_session is not null and exists (
    select 1 from auth.sessions s where s.id = v_session and (s.not_after is null or s.not_after > now()));
end $$;
revoke all on function public.fin_current_session_alive() from public, anon;
grant execute on function public.fin_current_session_alive() to authenticated, service_role;

-- O hook em si é invoker: roda com o papel da requisição e não abre nada a anon.
create or replace function public.fin_request_session_guard()
returns void language plpgsql security invoker set search_path = '' as $$
declare v_claims jsonb;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then v_claims := null;
  end;
  -- Só JWT de usuário: anon (sem token) e service_role ficam como estão.
  if v_claims is null or coalesce(v_claims->>'role', '') <> 'authenticated' then return; end if;
  if not public.fin_current_session_alive() then
    raise sqlstate 'PGRST' using
      message = '{"code":"session_revoked","message":"Sessão encerrada. Entre de novo para continuar.","details":null,"hint":null}',
      detail = '{"status":401,"headers":{}}';
  end if;
end $$;

revoke all on function public.fin_request_session_guard() from public;
grant execute on function public.fin_request_session_guard() to anon, authenticated, service_role;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_pre_request to ''public.fin_request_session_guard''';
  end if;
end $$;
notify pgrst, 'reload config';

insert into public.fin_settings (key, value) values ('schema_version', 'financial-session-revocation-1')
on conflict (key) do update set value = excluded.value, updated_at = now();

commit;

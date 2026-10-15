\set ON_ERROR_STOP on
-- Revogação de sessão no PostgREST (docs/supabase-financial-session-revocation.sql):
-- o hook de pré-requisição recusa JWT de usuário sem sessão viva em auth.sessions
-- (logout, sessão expirada pelo not_after, usuário removido) e deixa passar anon e
-- service_role. A prova ponta a ponta com GoTrue e PostgREST reais está nas
-- sondas SESSION-* de scripts/ci-demo/smoke.mjs (laboratório efêmero).
create table if not exists auth.sessions (id uuid primary key, user_id uuid, not_after timestamptz);
insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000e101', 'sess-user@example.invalid') on conflict (id) do nothing;
insert into auth.sessions (id, user_id, not_after) values
  ('00000000-0000-4000-8000-00000000e201', '00000000-0000-4000-8000-00000000e101', null),
  ('00000000-0000-4000-8000-00000000e202', '00000000-0000-4000-8000-00000000e101', now() - interval '1 minute')
on conflict (id) do nothing;

create or replace function pg_temp.guard_as(p_claims text) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', coalesce(p_claims, ''), true);
  perform public.fin_request_session_guard();
  return 'ok';
exception when sqlstate 'PGRST' then
  return 'recusado:' || (sqlerrm::jsonb->>'code');
end $$;

do $$
declare v text;
begin
  -- Concessões e forma: definer, search_path vazio, chamável pelos papéis da API.
  -- O hook é invoker (anon executa sem atravessar nada); só a checagem da própria
  -- sessão é definer, com search_path vazio, e não é concedida a anon.
  if (select prosecdef from pg_proc where oid = 'public.fin_request_session_guard()'::regprocedure) is not false
     or (select prosecdef from pg_proc where oid = 'public.fin_current_session_alive()'::regprocedure) is not true
     or not exists (select 1 from pg_proc where oid = 'public.fin_current_session_alive()'::regprocedure and proconfig @> array['search_path=""'])
     or has_function_privilege('anon', 'public.fin_current_session_alive()', 'EXECUTE') then
    raise exception 'forma do hook: invoker + checagem definer não concedida a anon';
  end if;
  if not has_function_privilege('anon', 'public.fin_request_session_guard()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.fin_request_session_guard()', 'EXECUTE') then
    raise exception 'anon e authenticated precisam executar o hook';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticator')
     and not exists (select 1 from pg_roles where rolname = 'authenticator' and rolconfig @> array['pgrst.db_pre_request=public.fin_request_session_guard']) then
    raise exception 'hook não registrado no authenticator';
  end if;

  v := pg_temp.guard_as('{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000e101","session_id":"00000000-0000-4000-8000-00000000e201"}');
  if v <> 'ok' then raise exception 'sessão viva recusada: %', v; end if;
  v := pg_temp.guard_as('{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000e101","session_id":"00000000-0000-4000-8000-00000000e299"}');
  if v <> 'recusado:session_revoked' then raise exception 'sessão inexistente (logout) aceita: %', v; end if;
  v := pg_temp.guard_as('{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000e101","session_id":"00000000-0000-4000-8000-00000000e202"}');
  if v <> 'recusado:session_revoked' then raise exception 'sessão com not_after vencido aceita: %', v; end if;
  v := pg_temp.guard_as('{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000e101"}');
  if v <> 'recusado:session_revoked' then raise exception 'JWT de usuário sem session_id aceito: %', v; end if;
  v := pg_temp.guard_as('{"role":"authenticated","session_id":"não-é-uuid"}');
  if v <> 'recusado:session_revoked' then raise exception 'session_id malformado aceito: %', v; end if;
  v := pg_temp.guard_as('{"role":"service_role"}');
  if v <> 'ok' then raise exception 'service_role barrado: %', v; end if;
  v := pg_temp.guard_as('{"role":"anon"}');
  if v <> 'ok' then raise exception 'anon barrado: %', v; end if;
  v := pg_temp.guard_as(null);
  if v <> 'ok' then raise exception 'requisição sem JWT barrada: %', v; end if;
  v := pg_temp.guard_as('não é json');
  if v <> 'ok' then raise exception 'claims ilegíveis precisam cair no caminho sem JWT (o PostgREST já validou a assinatura): %', v; end if;

  -- Sessão encerrada depois (logout = delete em auth.sessions): passa a recusar.
  delete from auth.sessions where id = '00000000-0000-4000-8000-00000000e201';
  v := pg_temp.guard_as('{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000e101","session_id":"00000000-0000-4000-8000-00000000e201"}');
  if v <> 'recusado:session_revoked' then raise exception 'logout não revogou: %', v; end if;
end $$;
select 'financial-session-revocation: sessão viva, logout, not_after, sem session_id, anon e service_role aprovados' as result;

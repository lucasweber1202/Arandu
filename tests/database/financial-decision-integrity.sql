\set ON_ERROR_STOP on
-- Integridade da decisão (docs/supabase-financial-decision-integrity.sql):
-- fin_record_decision_v2 recusa versão que o comprador não viu, versão inválida,
-- papel insuficiente e outro tenant; aceita a versão corrente; concessões mínimas.
-- A ordem de locks (envio × decisão) é coberta por financial-decision-race.sh.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000d201', 'dint-buyer@example.invalid'),
  ('00000000-0000-4000-8000-00000000d202', 'dint-provider@example.invalid'),
  ('00000000-0000-4000-8000-00000000d203', 'dint-analyst@example.invalid'),
  ('00000000-0000-4000-8000-00000000d204', 'dint-other@example.invalid')
on conflict (id) do nothing;
insert into public.fin_pilot_allowlist (pattern, created_by, note)
  select email, '00000000-0000-4000-8000-00000000d201', 'decision integrity test' from auth.users
   where id in ('00000000-0000-4000-8000-00000000d201','00000000-0000-4000-8000-00000000d202','00000000-0000-4000-8000-00000000d204')
on conflict (pattern) do nothing;
create temporary table dint_ids (key text primary key, value text);
grant all on dint_ids to authenticated;
create or replace function pg_temp.expect_error(p_sql text, p_message text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'esperava falha "%" em: %', p_message, p_sql;
exception when others then
  if sqlerrm not like p_message || '%' then raise exception 'falha inesperada em %: % (esperava %)', p_sql, sqlerrm, p_message; end if;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated;

do $$ begin
  if has_function_privilege('anon', 'public.fin_record_decision_v2(uuid,uuid,integer,jsonb,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.fin_record_decision_v2(uuid,uuid,integer,jsonb,text)', 'EXECUTE') then
    raise exception 'concessões de fin_record_decision_v2';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.fin_record_decision_v2(uuid,uuid,integer,jsonb,text)'::regprocedure) is not true
     or not exists (select 1 from pg_proc where oid = 'public.fin_record_decision_v2(uuid,uuid,integer,jsonb,text)'::regprocedure
                    and proconfig @> array['search_path=""']) then
    raise exception 'fin_record_decision_v2 precisa ser definer com search_path vazio';
  end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000d201', false);
insert into dint_ids select 'buyer', public.fin_create_organization('Compradora integridade DEMO', 'BUYER');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000d202', false);
insert into dint_ids select 'prov', public.fin_create_organization('Provedor integridade DEMO', 'PROVIDER');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000d204', false);
insert into dint_ids select 'other', public.fin_create_organization('Outra compradora integridade DEMO', 'BUYER');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000d201', false);
reset role;
insert into public.fin_members (organization_id, user_id, role)
  select value::uuid, '00000000-0000-4000-8000-00000000d203', 'analyst' from dint_ids where key = 'buyer';
set role authenticated;
insert into public.fin_providers (organization_id, name, kind, created_by)
  select value::uuid, 'Banco integridade DEMO', 'bank', '00000000-0000-4000-8000-00000000d201' from dint_ids where key = 'buyer';
insert into dint_ids select 'provider_row', id from public.fin_providers where name = 'Banco integridade DEMO';
insert into dint_ids select 'rfq', public.fin_create_rfq((select value::uuid from dint_ids where key = 'buyer'), 'credit', 'RFQ integridade DEMO', null,
  '{"amount":250000,"purpose":"capital_de_giro","term_months":12}'::jsonb, null);
select public.fin_transition('rfq', (select value::uuid from dint_ids where key = 'rfq'), 'open');
insert into dint_ids select 'token', public.fin_invite_provider((select value::uuid from dint_ids where key = 'rfq'), (select value::uuid from dint_ids where key = 'provider_row'));
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000d202', false);
select public.fin_accept_provider_invite((select value from dint_ids where key = 'token'), (select value::uuid from dint_ids where key = 'prov'));
insert into dint_ids select 'proposal', id from public.fin_proposals where provider_organization_id = (select value::uuid from dint_ids where key = 'prov');
select public.fin_submit_proposal((select value::uuid from dint_ids where key = 'proposal'), '{"institution":"Banco integridade","interest_rate_month":1.5,"term_months":12}'::jsonb);
-- O comprador abre a comparação na v1; o provedor revisa para a v2 depois disso.
select public.fin_submit_proposal((select value::uuid from dint_ids where key = 'proposal'), '{"institution":"Banco integridade","interest_rate_month":2.9,"term_months":12}'::jsonb);

-- Versão que o comprador viu (v1) já não é a corrente: recusa, nada gravado.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000d201', false);
select pg_temp.expect_error(format($q$select public.fin_record_decision_v2(%L, %L, 1, '{}'::jsonb, 'Decisão sobre v1.')$q$,
  (select value from dint_ids where key = 'rfq'), (select value from dint_ids where key = 'proposal')), 'proposal version changed');
-- Versão inválida, versão inexistente (futura) e proposta de outra RFQ.
select pg_temp.expect_error(format($q$select public.fin_record_decision_v2(%L, %L, 0)$q$,
  (select value from dint_ids where key = 'rfq'), (select value from dint_ids where key = 'proposal')), 'invalid expected version');
select pg_temp.expect_error(format($q$select public.fin_record_decision_v2(%L, %L, null)$q$,
  (select value from dint_ids where key = 'rfq'), (select value from dint_ids where key = 'proposal')), 'invalid expected version');
select pg_temp.expect_error(format($q$select public.fin_record_decision_v2(%L, %L, 3)$q$,
  (select value from dint_ids where key = 'rfq'), (select value from dint_ids where key = 'proposal')), 'proposal version changed');
select pg_temp.expect_error(format($q$select public.fin_record_decision_v2(%L, gen_random_uuid(), 2)$q$,
  (select value from dint_ids where key = 'rfq')), 'proposal not eligible');
-- Papel insuficiente (analista) e outro tenant.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000d203', false);
select pg_temp.expect_error(format($q$select public.fin_record_decision_v2(%L, %L, 2)$q$,
  (select value from dint_ids where key = 'rfq'), (select value from dint_ids where key = 'proposal')), 'forbidden');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000d204', false);
select pg_temp.expect_error(format($q$select public.fin_record_decision_v2(%L, %L, 2)$q$,
  (select value from dint_ids where key = 'rfq'), (select value from dint_ids where key = 'proposal')), 'forbidden');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000d202', false);
select pg_temp.expect_error(format($q$select public.fin_record_decision_v2(%L, %L, 2)$q$,
  (select value from dint_ids where key = 'rfq'), (select value from dint_ids where key = 'proposal')), 'forbidden');

-- Nenhuma decisão até aqui; com a versão corrente (v2), a decisão é gravada nela.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000d201', false);
do $$ begin
  if exists (select 1 from public.fin_decisions where rfq_id = (select value::uuid from dint_ids where key = 'rfq')) then
    raise exception 'recusa gravou decisão';
  end if;
end $$;
insert into dint_ids select 'decision', public.fin_record_decision_v2((select value::uuid from dint_ids where key = 'rfq'),
  (select value::uuid from dint_ids where key = 'proposal'), 2, '{}'::jsonb, 'Decisão sobre a versão vista.');
do $$ begin
  if (select snapshot->>'decided_version' from public.fin_decisions where id = (select value::uuid from dint_ids where key = 'decision')) <> '2' then
    raise exception 'decisão não ficou na versão vista';
  end if;
end $$;
-- Repetir a decisão continua recusado pela regra existente (RFQ já decidida).
select pg_temp.expect_error(format($q$select public.fin_record_decision_v2(%L, %L, 2)$q$,
  (select value from dint_ids where key = 'rfq'), (select value from dint_ids where key = 'proposal')), 'invalid state');
-- Depois da decisão, o provedor não grava versão nova.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000d202', false);
select pg_temp.expect_error(format($q$select public.fin_submit_proposal(%L, '{"institution":"Banco integridade","interest_rate_month":0.5}'::jsonb)$q$,
  (select value from dint_ids where key = 'proposal')), 'rfq is not receiving proposals');
reset role;
select 'financial-decision-integrity: versão vista, recusas e concessões aprovadas' as result;

\set ON_ERROR_STOP on
-- Criação de RFQ idempotente (docs/supabase-financial-request-receipts.sql).
-- O PostgREST expõe os cabeçalhos em request.headers; aqui o teste os define
-- como o PostgREST faria, dentro da transação de cada chamada.
insert into auth.users(id,email) values
('00000000-0000-4000-8000-00000000d601','rr-buyer@example.invalid'),
('00000000-0000-4000-8000-00000000d602','rr-colleague@example.invalid')
on conflict(id) do nothing;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-00000000d611','Recibos DEMO','BUYER','00000000-0000-4000-8000-00000000d601');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-00000000d611','00000000-0000-4000-8000-00000000d601','finance_manager'),
('00000000-0000-4000-8000-00000000d611','00000000-0000-4000-8000-00000000d602','finance_manager');

do $$ begin
  if has_table_privilege('authenticated','public.fin_request_receipts','INSERT') or has_table_privilege('authenticated','public.fin_request_receipts','UPDATE')
     or has_table_privilege('authenticated','public.fin_request_receipts','DELETE') or has_table_privilege('anon','public.fin_request_receipts','SELECT')
     or has_function_privilege('authenticated','public.fin_rfq_request_receipt()','EXECUTE') then
    raise exception 'recibo gravável pelo cliente ou visível a anônimo';
  end if;
end $$;

create or replace function pg_temp.rr_create(p_key text) returns uuid language plpgsql as $$
begin
  perform set_config('request.headers', case when p_key is null then '{}' else jsonb_build_object('x-arandu-request-key', p_key)::text end, true);
  return public.fin_create_rfq('00000000-0000-4000-8000-00000000d611','credit','Recibo DEMO',null,'{}'::jsonb,null);
end $$;
create or replace function pg_temp.rr_error(p_key text) returns text language plpgsql as $$
begin
  perform pg_temp.rr_create(p_key);
  return null;
exception when others then return sqlerrm;
end $$;
grant execute on function pg_temp.rr_create(text), pg_temp.rr_error(text) to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000d601',false);
do $$
declare v_first uuid; v_count integer; v_key text := '7c1d1e9a-3b44-4f0a-9d2e-1a2b3c4d5e6f';
begin
  -- Sem chave: comportamento anterior (duas criações, duas RFQs).
  perform pg_temp.rr_create(null); perform pg_temp.rr_create(null);
  if (select count(*) from public.fin_rfqs where organization_id = '00000000-0000-4000-8000-00000000d611') <> 2 then raise exception 'criação sem chave mudou'; end if;
  -- Com chave: a primeira cria e deixa recibo visível a quem criou.
  v_first := pg_temp.rr_create(v_key);
  if (select rfq_id from public.fin_request_receipts where request_key = v_key::uuid) is distinct from v_first then raise exception 'recibo não aponta para a RFQ criada'; end if;
  select count(*) into v_count from public.fin_rfqs where organization_id = '00000000-0000-4000-8000-00000000d611';
  -- Repetir a chave não cria outra RFQ (a transação inteira é desfeita).
  if pg_temp.rr_error(v_key) is distinct from 'duplicate request' then raise exception 'chave repetida não foi recusada'; end if;
  if (select count(*) from public.fin_rfqs where organization_id = '00000000-0000-4000-8000-00000000d611') <> v_count then raise exception 'chave repetida criou RFQ duplicada'; end if;
  if pg_temp.rr_error('nao-e-uuid') is distinct from 'invalid request key' then raise exception 'chave inválida aceita'; end if;
end $$;

-- Outra pessoa: espaço de chaves próprio e sem ver o recibo alheio.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000d602',false);
do $$ begin
  if exists (select 1 from public.fin_request_receipts) then raise exception 'recibo de outra pessoa visível'; end if;
  perform pg_temp.rr_create('7c1d1e9a-3b44-4f0a-9d2e-1a2b3c4d5e6f');
end $$;
reset role;

-- Recibo vencido (24 h) libera a chave.
update public.fin_request_receipts set created_at = now() - interval '25 hours'
 where actor_id = '00000000-0000-4000-8000-00000000d601';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000d601',false);
do $$ begin
  perform pg_temp.rr_create('7c1d1e9a-3b44-4f0a-9d2e-1a2b3c4d5e6f');
  if (select count(*) from public.fin_request_receipts where actor_id = auth.uid()) <> 1 then raise exception 'recibo vencido não foi substituído'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',false);
select set_config('request.headers','',false);
\echo 'Criação de RFQ idempotente: sem chave inalterada, chave repetida sem duplicata, chave inválida recusada, recibo privado por pessoa e validade de 24 h validados.'

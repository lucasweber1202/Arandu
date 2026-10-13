-- Criação de RFQ idempotente para a interface (13/10/2026).
--
-- Quando a criação fica sem resposta (rede caiu, prazo de 60 s), a tela avisa
-- que o resultado é desconhecido, mas o botão volta e um novo clique gravava
-- uma segunda RFQ igual. Agora a tela manda uma chave por intenção de criar
-- (cabeçalho x-arandu-request-key, repassado pelo servidor ao PostgREST, que o
-- expõe em request.headers — o mesmo mecanismo da trilha operacional). O
-- recibo nasce na mesma transação da RFQ: ou os dois existem, ou nenhum.
-- Repetir a chave aborta a segunda criação com 'duplicate request' e o
-- servidor devolve a RFQ já registrada.
--
-- Sem a chave, nada muda (seed, API pública, oportunidades). Recibo vale
-- 24 h e é apagado na próxima criação da mesma pessoa depois disso.
-- Aditiva e idempotente; rollback em
-- docs/rollback/supabase-financial-request-receipts.rollback.sql.
begin;

create table if not exists public.fin_request_receipts (
  actor_id uuid not null references auth.users(id) on delete cascade,
  request_key uuid not null,
  operation text not null check (operation in ('rfq_create')),
  organization_id uuid not null references public.fin_organizations(id) on delete cascade,
  rfq_id uuid not null references public.fin_rfqs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (actor_id, request_key)
);
create index if not exists fin_request_receipts_rfq on public.fin_request_receipts(rfq_id);
alter table public.fin_request_receipts enable row level security;
alter table public.fin_request_receipts force row level security;
revoke all on public.fin_request_receipts from public, anon, authenticated;
grant select on public.fin_request_receipts to authenticated;
drop policy if exists fin_request_receipt_read on public.fin_request_receipts;
create policy fin_request_receipt_read on public.fin_request_receipts for select to authenticated
  using (actor_id = auth.uid() and public.fin_has_role(organization_id));

create or replace function public.fin_rfq_request_receipt()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_key text;
begin
  v_key := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb) ->> 'x-arandu-request-key';
  if v_key is null or v_actor is null then return null; end if;
  if v_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid request key'; end if;
  delete from public.fin_request_receipts where actor_id = v_actor and created_at < now() - interval '24 hours';
  -- Concorrência: a segunda transação com a mesma chave espera a primeira e,
  -- se ela confirmou, cai aqui; se ela desfez, esta segue normalmente.
  insert into public.fin_request_receipts(actor_id, request_key, operation, organization_id, rfq_id)
    values (v_actor, v_key::uuid, 'rfq_create', new.organization_id, new.id)
    on conflict (actor_id, request_key) do nothing;
  if not found then raise exception 'duplicate request'; end if;
  return null;
end $$;
revoke all on function public.fin_rfq_request_receipt() from public, anon, authenticated;
drop trigger if exists fin_rfqs_request_receipt on public.fin_rfqs;
create trigger fin_rfqs_request_receipt after insert on public.fin_rfqs
  for each row execute function public.fin_rfq_request_receipt();

insert into public.fin_settings(key, value) values ('schema_version', 'financial-request-receipts-1')
  on conflict (key) do update set value = excluded.value, updated_at = now();
commit;

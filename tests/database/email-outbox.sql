\set ON_ERROR_STOP on
-- Outbox transacional (infraestrutura compartilhada que sobreviveu à
-- aposentadoria da vertical de arte): enfileiramento pelo caminho financeiro
-- (fin_enqueue_email), idempotência, claim com lease, entrega, retry,
-- dead-letter e minimização do endereço. Roda sobre o schema final.
insert into public.fin_settings(key, value) values ('email_enabled', 'true')
  on conflict (key) do update set value = excluded.value;
select public.fin_enqueue_email('rfq_opened', 'comprador-outbox@example.com', 'rfq', '00000000-0000-4000-8000-0000000e0001',
  '{"title":"Teste"}'::jsonb, 'email-test:first');
select public.fin_enqueue_email('deadline_near', 'comprador-outbox@example.com', 'rfq', '00000000-0000-4000-8000-0000000e0001',
  '{}'::jsonb, 'email-test:second');
select public.fin_enqueue_email('renewal_due', 'comprador-outbox@example.com', 'contract', '00000000-0000-4000-8000-0000000e0002',
  '{}'::jsonb, 'email-test:third');
-- Replay da mesma chave não cria duplicata.
select public.fin_enqueue_email('rfq_opened', 'comprador-outbox@example.com', 'rfq', '00000000-0000-4000-8000-0000000e0001',
  '{}'::jsonb, 'email-test:first');
-- Template fora do catálogo financeiro é recusado.
do $$ begin
  perform public.fin_enqueue_email('order_created', 'comprador-outbox@example.com', 'rfq', '00000000-0000-4000-8000-0000000e0001', '{}'::jsonb, 'email-test:art');
  raise exception 'outbox aceitou template da vertical de arte';
exception when others then
  if sqlerrm <> 'unknown template' then raise; end if;
end $$;
update public.fin_settings set value = 'false' where key = 'email_enabled';

do $$
begin
  if (select count(*) from public.transactional_email_outbox where idempotency_key like 'email-test:%') <> 3 then
    raise exception 'Outbox não preservou idempotência dos três eventos de teste';
  end if;
  if exists (
    select 1 from public.transactional_email_outbox
    where idempotency_key like 'email-test:%'
      and recipient_hash !~ '^[0-9a-f]{64}$'
  ) then
    raise exception 'Hash do destinatário não foi persistido corretamente';
  end if;
  if has_table_privilege('authenticated', 'public.transactional_email_outbox', 'SELECT') then
    raise exception 'authenticated consegue consultar a outbox';
  end if;
end;
$$;

update public.transactional_email_outbox
set max_attempts = 1
where idempotency_key = 'email-test:third';

create temporary table claimed_email_items(item jsonb);
insert into claimed_email_items
select value from jsonb_array_elements(public.claim_transactional_email_batch_v2('database-email-worker', 10));

do $$
begin
  if (select count(*) from public.transactional_email_outbox where idempotency_key like 'email-test:%' and status='processing' and attempts=1) <> 3 then
    raise exception 'Claim concorrente não moveu os três eventos para processing';
  end if;
end;
$$;

select public.complete_transactional_email_v2(
  (select id from public.transactional_email_outbox where idempotency_key='email-test:first'),
  (select (item->>'claimToken')::uuid from claimed_email_items where item->>'id'=(select id::text from public.transactional_email_outbox where idempotency_key='email-test:first')),
  'mock-provider',
  'provider-reference-1'
);
select public.fail_transactional_email_v2(
  (select id from public.transactional_email_outbox where idempotency_key='email-test:second'),
  (select (item->>'claimToken')::uuid from claimed_email_items where item->>'id'=(select id::text from public.transactional_email_outbox where idempotency_key='email-test:second')),
  'temporary_failure',
  60
);
select public.fail_transactional_email_v2(
  (select id from public.transactional_email_outbox where idempotency_key='email-test:third'),
  (select (item->>'claimToken')::uuid from claimed_email_items where item->>'id'=(select id::text from public.transactional_email_outbox where idempotency_key='email-test:third')),
  'permanent_failure',
  60
);

do $$
declare
  delivered public.transactional_email_outbox%rowtype;
  retry_row public.transactional_email_outbox%rowtype;
  dead_row public.transactional_email_outbox%rowtype;
begin
  select * into delivered from public.transactional_email_outbox where idempotency_key='email-test:first';
  select * into retry_row from public.transactional_email_outbox where idempotency_key='email-test:second';
  select * into dead_row from public.transactional_email_outbox where idempotency_key='email-test:third';

  if delivered.status <> 'delivered' or delivered.delivered_at is null or delivered.recipient_address is not null then
    raise exception 'Evento entregue não minimizou o endereço do destinatário';
  end if;
  if retry_row.status <> 'retry' or retry_row.recipient_address is null or retry_row.next_attempt_at <= now() then
    raise exception 'Retry não preservou endereço temporário ou agendamento';
  end if;
  if dead_row.status <> 'dead' or dead_row.recipient_address is not null then
    raise exception 'Dead-letter não minimizou o endereço do destinatário';
  end if;
end;
$$;

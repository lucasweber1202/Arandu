\set ON_ERROR_STOP on

update public.profiles
set email = 'buyer-order-test@example.com'
where id = '11111111-1111-4111-8111-111111111111';

-- O teste de orders já criou/concluiu o pedido. Como o e-mail do perfil pode ter
-- sido preenchido depois da criação, enfileiramos os três eventos canônicos de
-- forma explícita para validar idempotência, claim, retry, dead-letter e minimização.
select public.enqueue_transactional_email_for_user(
  '11111111-1111-4111-8111-111111111111',
  'order.created', 'order',
  (select id::text from public.orders where artwork_id='obra-order-test' order by created_at desc limit 1),
  'order_created',
  jsonb_build_object('orderNumber', (select order_number from public.orders where artwork_id='obra-order-test' order by created_at desc limit 1)),
  'request-email-order-created',
  'email-test:order-created'
);
select public.enqueue_transactional_email_for_user(
  '11111111-1111-4111-8111-111111111111',
  'order.payment_confirmed', 'order',
  (select id::text from public.orders where artwork_id='obra-order-test' order by created_at desc limit 1),
  'payment_confirmed',
  jsonb_build_object('orderNumber', (select order_number from public.orders where artwork_id='obra-order-test' order by created_at desc limit 1)),
  'request-email-payment',
  'email-test:payment-confirmed'
);
select public.enqueue_transactional_email_for_user(
  '11111111-1111-4111-8111-111111111111',
  'order.shipped', 'order',
  (select id::text from public.orders where artwork_id='obra-order-test' order by created_at desc limit 1),
  'order_shipped',
  jsonb_build_object('orderNumber', (select order_number from public.orders where artwork_id='obra-order-test' order by created_at desc limit 1), 'trackingCode', 'TRACK-TEST-001'),
  'request-email-shipped',
  'email-test:order-shipped'
);

-- Replay da mesma chave não cria duplicata.
select public.enqueue_transactional_email_for_user(
  '11111111-1111-4111-8111-111111111111',
  'order.created', 'order',
  (select id::text from public.orders where artwork_id='obra-order-test' order by created_at desc limit 1),
  'order_created', '{}'::jsonb,
  'request-email-order-created-replay',
  'email-test:order-created'
);

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
where idempotency_key = 'email-test:order-shipped';

select public.claim_transactional_email_batch('database-email-worker', 10);

do $$
begin
  if (select count(*) from public.transactional_email_outbox where idempotency_key like 'email-test:%' and status='processing' and attempts=1) <> 3 then
    raise exception 'Claim concorrente não moveu os três eventos para processing';
  end if;
end;
$$;

select public.complete_transactional_email(
  (select id from public.transactional_email_outbox where idempotency_key='email-test:order-created'),
  'mock-provider',
  'provider-reference-1'
);
select public.fail_transactional_email(
  (select id from public.transactional_email_outbox where idempotency_key='email-test:payment-confirmed'),
  'temporary_failure',
  60
);
select public.fail_transactional_email(
  (select id from public.transactional_email_outbox where idempotency_key='email-test:order-shipped'),
  'permanent_failure',
  60
);

do $$
declare
  delivered public.transactional_email_outbox%rowtype;
  retry_row public.transactional_email_outbox%rowtype;
  dead_row public.transactional_email_outbox%rowtype;
begin
  select * into delivered from public.transactional_email_outbox where idempotency_key='email-test:order-created';
  select * into retry_row from public.transactional_email_outbox where idempotency_key='email-test:payment-confirmed';
  select * into dead_row from public.transactional_email_outbox where idempotency_key='email-test:order-shipped';

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

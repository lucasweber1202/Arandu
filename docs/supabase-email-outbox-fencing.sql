-- Arandu — fencing de workers da outbox e eventos completos de pedido.
-- Aplicar por último, depois de docs/supabase-operational-trail-completeness.sql.
-- Depende apenas da outbox transacional e de public.orders, ambas bem antes na cadeia.
-- Esta migration não habilita provedor, cron ou gate comercial.

alter table public.transactional_email_outbox
  add column if not exists worker_ref text,
  add column if not exists claim_token uuid,
  add column if not exists lease_expires_at timestamptz;

create index if not exists idx_transactional_email_outbox_lease
  on public.transactional_email_outbox(status, lease_expires_at, next_attempt_at, created_at);

create or replace function public.claim_transactional_email_batch_v2(
  p_worker_ref text,
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_items jsonb;
begin
  if coalesce(length(trim(p_worker_ref)), 0) < 8 then
    raise exception using message = 'Worker inválido.', errcode = '22023';
  end if;
  with candidates as (
    select id from public.transactional_email_outbox
    where (status in ('pending','retry') and next_attempt_at <= now())
       or (status = 'processing' and lease_expires_at <= now())
    order by created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  ), claimed as (
    update public.transactional_email_outbox o
    set status = 'processing', attempts = attempts + 1, claimed_at = now(),
        worker_ref = left(trim(p_worker_ref), 120), claim_token = gen_random_uuid(),
        lease_expires_at = now() + interval '10 minutes', updated_at = now(),
        last_error_code = null
    from candidates c where o.id = c.id returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'eventType', event_type, 'entityType', entity_type,
    'entityId', entity_id, 'template', template,
    'recipientAddress', recipient_address, 'recipientRef', left(recipient_hash, 16),
    'payload', payload, 'attempts', attempts, 'maxAttempts', max_attempts,
    'requestId', request_id, 'idempotencyKey', idempotency_key,
    'workerRef', worker_ref, 'claimToken', claim_token
  ) order by created_at), '[]'::jsonb) into v_items from claimed;
  return v_items;
end;
$$;

create or replace function public.complete_transactional_email_v2(
  p_id uuid, p_claim_token uuid, p_provider text, p_provider_reference text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.transactional_email_outbox%rowtype;
begin
  update public.transactional_email_outbox
  set status = 'delivered', delivered_at = now(),
      provider = nullif(left(trim(p_provider), 40), ''),
      provider_reference = nullif(left(trim(p_provider_reference), 180), ''),
      recipient_address = null, claimed_at = null, worker_ref = null,
      claim_token = null, lease_expires_at = null, updated_at = now(), last_error_code = null
  where id = p_id and status = 'processing' and claim_token = p_claim_token
    and lease_expires_at > now()
  returning * into v_row;
  if not found then raise exception using message = 'Lease da outbox inválida ou expirada.', errcode = 'P0001'; end if;
  return jsonb_build_object('ok', true, 'id', v_row.id, 'status', v_row.status);
end;
$$;

create or replace function public.fail_transactional_email_v2(
  p_id uuid, p_claim_token uuid, p_error_code text, p_retry_after_seconds integer default 60
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.transactional_email_outbox%rowtype; v_dead boolean; v_delay integer;
begin
  select * into v_row from public.transactional_email_outbox
  where id = p_id and status = 'processing' and claim_token = p_claim_token
    and lease_expires_at > now() for update;
  if not found then raise exception using message = 'Lease da outbox inválida ou expirada.', errcode = 'P0001'; end if;
  v_dead := v_row.attempts >= v_row.max_attempts;
  v_delay := greatest(30, least(coalesce(p_retry_after_seconds, 60), 86400));
  update public.transactional_email_outbox
  set status = case when v_dead then 'dead' else 'retry' end,
      next_attempt_at = case when v_dead then next_attempt_at else now() + make_interval(secs => v_delay) end,
      claimed_at = null, worker_ref = null, claim_token = null, lease_expires_at = null,
      recipient_address = case when v_dead then null else recipient_address end,
      last_error_code = left(coalesce(nullif(trim(p_error_code), ''), 'delivery_failed'), 120), updated_at = now()
  where id = p_id returning * into v_row;
  return jsonb_build_object('ok', true, 'id', v_row.id, 'status', v_row.status, 'attempts', v_row.attempts);
end;
$$;

revoke all on function public.claim_transactional_email_batch(text,integer) from service_role;
revoke all on function public.complete_transactional_email(uuid,text,text) from service_role;
revoke all on function public.fail_transactional_email(uuid,text,integer) from service_role;
revoke all on function public.claim_transactional_email_batch_v2(text,integer) from public, anon, authenticated;
revoke all on function public.complete_transactional_email_v2(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.fail_transactional_email_v2(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.claim_transactional_email_batch_v2(text,integer) to service_role;
grant execute on function public.complete_transactional_email_v2(uuid,uuid,text,text) to service_role;
grant execute on function public.fail_transactional_email_v2(uuid,uuid,text,integer) to service_role;

create or replace function public.enqueue_order_email_events()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.enqueue_transactional_email_for_user(new.user_id,'order.created','order',new.id::text,'order_created',jsonb_build_object('orderNumber',new.order_number),coalesce(new.request_id,'order-'||new.id::text),'order.created:'||new.id::text);
    return new;
  end if;
  if old.status is distinct from new.status and new.status = 'confirmed' then
    perform public.enqueue_transactional_email_for_user(new.user_id,'order.confirmed','order',new.id::text,'order_confirmed',jsonb_build_object('orderNumber',new.order_number),coalesce(new.request_id,'order-'||new.id::text),'order.confirmed:'||new.id::text);
  end if;
  if old.payment_status is distinct from new.payment_status and new.payment_status = 'paid' then
    perform public.enqueue_transactional_email_for_user(new.user_id,'order.payment_confirmed','order',new.id::text,'payment_confirmed',jsonb_build_object('orderNumber',new.order_number),coalesce(new.request_id,'order-'||new.id::text),'order.payment_confirmed:'||new.id::text);
  end if;
  if old.fulfillment_status is distinct from new.fulfillment_status and new.fulfillment_status = 'shipped' then
    perform public.enqueue_transactional_email_for_user(new.user_id,'order.shipped','order',new.id::text,'order_shipped',jsonb_build_object('orderNumber',new.order_number,'trackingCode',coalesce(new.tracking_code,'')),coalesce(new.request_id,'order-'||new.id::text),'order.shipped:'||new.id::text);
  end if;
  if old.fulfillment_status is distinct from new.fulfillment_status and new.fulfillment_status = 'delivered' then
    perform public.enqueue_transactional_email_for_user(new.user_id,'order.delivered','order',new.id::text,'order_delivered',jsonb_build_object('orderNumber',new.order_number),coalesce(new.request_id,'order-'||new.id::text),'order.delivered:'||new.id::text);
  end if;
  if old.status is distinct from new.status and new.status = 'completed' then
    perform public.enqueue_transactional_email_for_user(new.user_id,'order.completed','order',new.id::text,'order_completed',jsonb_build_object('orderNumber',new.order_number),coalesce(new.request_id,'order-'||new.id::text),'order.completed:'||new.id::text);
  end if;
  if old.status is distinct from new.status and new.status = 'cancelled' then
    perform public.enqueue_transactional_email_for_user(new.user_id,'order.cancelled','order',new.id::text,'order_cancelled',jsonb_build_object('orderNumber',new.order_number),coalesce(new.request_id,'order-'||new.id::text),'order.cancelled:'||new.id::text);
  end if;
  if old.payment_status is distinct from new.payment_status and new.payment_status = 'refunded' then
    perform public.enqueue_transactional_email_for_user(new.user_id,'order.refunded','order',new.id::text,'order_refunded',jsonb_build_object('orderNumber',new.order_number),coalesce(new.request_id,'order-'||new.id::text),'order.refunded:'||new.id::text);
  end if;
  return new;
end;
$$;

-- O gatilho criado por docs/supabase-transactional-email-outbox.sql observa
-- apenas payment_status e fulfillment_status. A função acima passou a tratar
-- também transições de `status` (confirmed, completed, cancelled); sem incluir
-- essa coluna na lista observada, esses três eventos nunca seriam enfileirados.
drop trigger if exists trg_orders_transactional_email on public.orders;
create trigger trg_orders_transactional_email
after insert or update of status, payment_status, fulfillment_status on public.orders
for each row execute function public.enqueue_order_email_events();

#!/usr/bin/env bash
set -euo pipefail

database_url="$1"

psql "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
insert into public.artworks (
  id, slug, title, artist_id, price, status, published, main_image_url,
  image_authorized_at, price_verified_at, availability_verified_at,
  catalog_verified_at, source_reference, editorial_status
)
values (
  'obra-order-concurrency', 'obra-order-concurrency', 'Obra Order Concurrency', 'artista-1', 3000, 'available', true,
  'https://example.com/order-concurrency.webp', now(), now(), now(), now(), 'database-order-concurrency', 'published'
)
on conflict (id) do update set status = 'available', price = excluded.price, published = true;

select public.acquire_idempotency(
  'reservation.order-concurrency', repeat('a',64), repeat('b',64), repeat('c',64), 120, 86400
);
select public.create_reservation_atomic(
  'obra-order-concurrency',
  '11111111-1111-4111-8111-111111111111',
  null,
  'Pessoa A',
  '21999999999',
  '24 horas',
  null,
  now() + interval '24 hours',
  'BRL',
  'policy-order-concurrency-v1',
  '{"version":"policy-order-concurrency-v1","currency":"BRL","platformFeeRate":0.20,"reservationHours":24}'::jsonb,
  'database-order-concurrency',
  'system',
  'database-order-concurrency',
  'request-order-concurrency-reservation',
  'reservation.order-concurrency',
  repeat('a',64), repeat('b',64), repeat('c',64)
);
update public.reservations
set status = 'confirmed', confirmed_at = coalesce(confirmed_at, now())
where artwork_id = 'obra-order-concurrency';

select public.acquire_idempotency('orders.concurrent', repeat('d',64), repeat('f',64), repeat('1',64), 120, 86400);
select public.acquire_idempotency('orders.concurrent', repeat('e',64), repeat('f',64), repeat('2',64), 120, 86400);
SQL

reservation_id="$(psql "$database_url" -Atc "select id from public.reservations where artwork_id='obra-order-concurrency' order by created_at desc limit 1;")"
if [[ -z "$reservation_id" ]]; then
  echo "Reserva de concorrência de pedido não foi criada." >&2
  exit 1
fi

call_order() {
  local key_hash="$1"
  local request_hash="$2"
  local request_id="$3"
  psql "$database_url" -At -v ON_ERROR_STOP=1 -c "
    select (public.create_order_atomic(
      '${reservation_id}'::uuid,
      null,
      null,
      'database-order-concurrency',
      'operator',
      '${request_id}',
      'orders.concurrent',
      repeat('${key_hash}',64),
      repeat('f',64),
      repeat('${request_hash}',64)
    ))->>'statusCode';
  "
}

call_order "d" "1" "request-order-concurrency-1" > /tmp/arandu-order-1.log 2>&1 &
pid_one=$!
call_order "e" "2" "request-order-concurrency-2" > /tmp/arandu-order-2.log 2>&1 &
pid_two=$!
wait "$pid_one"
wait "$pid_two"

status_one="$(sed -n '1p' /tmp/arandu-order-1.log | tr -d '[:space:]')"
status_two="$(sed -n '1p' /tmp/arandu-order-2.log | tr -d '[:space:]')"
statuses="$(printf '%s\n%s\n' "$status_one" "$status_two" | sort)"

if [[ "$statuses" != $'200\n201' ]]; then
  echo "Resultados inesperados na criação concorrente de pedido:" >&2
  cat /tmp/arandu-order-1.log >&2
  cat /tmp/arandu-order-2.log >&2
  exit 1
fi

order_count="$(psql "$database_url" -Atc "select count(*) from public.orders where reservation_id='${reservation_id}'::uuid;")"
if [[ "$order_count" != "1" ]]; then
  echo "Concorrência criou ${order_count} pedidos para a mesma reserva." >&2
  exit 1
fi

completed_keys="$(psql "$database_url" -Atc "select count(*) from public.idempotency_keys where scope='orders.concurrent' and status='completed';")"
if [[ "$completed_keys" != "2" ]]; then
  echo "Idempotências concorrentes de pedido não foram concluídas: ${completed_keys}." >&2
  exit 1
fi

echo "Concorrência de pedidos aprovada: uma linha, respostas 201/200 e duas idempotências concluídas."

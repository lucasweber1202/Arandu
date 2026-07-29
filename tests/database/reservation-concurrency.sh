#!/usr/bin/env bash
set -euo pipefail

database_url="$1"

call_idempotency() {
  psql "$database_url" -At -v ON_ERROR_STOP=1 -c "
    select public.acquire_idempotency(
      'idempotency.concurrent',
      repeat('9',64),
      repeat('8',64),
      repeat('7',64),
      120,
      86400
    )->>'outcome';
  "
}

call_idempotency > /tmp/arandu-idempotency-1.log 2>&1 &
idempotency_pid_one=$!
call_idempotency > /tmp/arandu-idempotency-2.log 2>&1 &
idempotency_pid_two=$!
wait "$idempotency_pid_one"
wait "$idempotency_pid_two"

idempotency_outcomes="$(
  sed -n '1p' /tmp/arandu-idempotency-1.log
  sed -n '1p' /tmp/arandu-idempotency-2.log
)"
if [[ "$(printf '%s\n' "$idempotency_outcomes" | grep -c '^acquired$')" -ne 1 ]] \
  || [[ "$(printf '%s\n' "$idempotency_outcomes" | grep -c '^in_progress$')" -ne 1 ]]; then
  echo "Aquisição concorrente de idempotência não foi serializada:" >&2
  printf '%s\n' "$idempotency_outcomes" >&2
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
select public.acquire_idempotency('reservation.concurrent', repeat('1',64), repeat('3',64), repeat('5',64), 120, 86400);
select public.acquire_idempotency('reservation.concurrent', repeat('2',64), repeat('4',64), repeat('6',64), 120, 86400);
SQL

call_reservation() {
  local key_hash="$1"
  local identity_hash="$2"
  local request_hash="$3"
  psql "$database_url" -v ON_ERROR_STOP=1 -c "
    select public.create_reservation_atomic(
      'obra-2',
      null,
      'visitor-concurrency',
      'Pessoa concorrente',
      '21999999999',
      '24 horas',
      null,
      now() + interval '24 hours',
      'BRL',
      'policy-test-v1',
      'database-concurrency',
      'system',
      'visitor-concurrency',
      'request-concurrency-${key_hash}',
      'reservation.concurrent',
      repeat('${key_hash}',64),
      repeat('${identity_hash}',64),
      repeat('${request_hash}',64)
    );
  "
}

set +e
call_reservation "1" "3" "5" > /tmp/arandu-reservation-1.log 2>&1 &
pid_one=$!
call_reservation "2" "4" "6" > /tmp/arandu-reservation-2.log 2>&1 &
pid_two=$!
wait "$pid_one"
status_one=$?
wait "$pid_two"
status_two=$?
set -e

if [[ "$status_one" -eq 0 && "$status_two" -eq 0 ]]; then
  echo "As duas reservas concorrentes venceram." >&2
  exit 1
fi
if [[ "$status_one" -ne 0 && "$status_two" -ne 0 ]]; then
  echo "Nenhuma reserva concorrente venceu." >&2
  sed -n '1,80p' /tmp/arandu-reservation-1.log >&2
  sed -n '1,80p' /tmp/arandu-reservation-2.log >&2
  exit 1
fi

active_count="$(psql "$database_url" -Atc "select count(*) from public.reservations where artwork_id='obra-2' and status in ('requested','confirmed');")"
if [[ "$active_count" != "1" ]]; then
  echo "Quantidade inesperada de reservas ativas: ${active_count}" >&2
  exit 1
fi

echo "Concorrência de reservas aprovada: exatamente uma vencedora."

#!/usr/bin/env bash
set -euo pipefail
database_url="$1"

psql "$database_url" -v ON_ERROR_STOP=1 -c "
  update public.transactional_email_outbox
  set status='pending', next_attempt_at=now(), claimed_at=null, worker_ref=null,
      claim_token=null, lease_expires_at=null, attempts=0
  where idempotency_key='email-test:second';
" >/dev/null

claim() {
  local worker="$1"
  psql "$database_url" -At -v ON_ERROR_STOP=1 -c "select jsonb_array_length(public.claim_transactional_email_batch_v2('${worker}',1));"
}
first_log="$(mktemp)"
second_log="$(mktemp)"
claim "concurrent-email-worker-one" >"$first_log" & pid_one=$!
claim "concurrent-email-worker-two" >"$second_log" & pid_two=$!
wait "$pid_one"; wait "$pid_two"
claims="$(tr -d '[:space:]' <"$first_log")$(tr -d '[:space:]' <"$second_log")"
if [[ "$claims" != "10" && "$claims" != "01" ]]; then
  echo "Claims concorrentes inesperados: $claims" >&2
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare
  v_id uuid;
  v_old_token uuid;
  v_new_token uuid;
begin
  select id, claim_token into v_id, v_old_token
  from public.transactional_email_outbox
  where idempotency_key='email-test:second';
  update public.transactional_email_outbox set lease_expires_at=now()-interval '1 second' where id=v_id;
  perform public.claim_transactional_email_batch_v2('replacement-email-worker',1);
  select claim_token into v_new_token from public.transactional_email_outbox where id=v_id;
  if v_new_token is null or v_new_token = v_old_token then
    raise exception 'Reclaim não renovou o fencing token';
  end if;
  begin
    perform public.complete_transactional_email_v2(v_id,v_old_token,'mock','stale-worker');
    raise exception 'Worker obsoleto conseguiu concluir após reclaim';
  exception when sqlstate 'P0001' then null;
  end;
  perform public.fail_transactional_email_v2(v_id,v_new_token,'test_cleanup',60);
end;
$$;
SQL

echo "Concorrência e stale-worker fencing da outbox aprovados."

#!/usr/bin/env bash
set -euo pipefail
url="$1"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cat > "$work/holder.sql" <<'SQL'
begin;
select set_config('request.jwt.claim.sub','',false);
select set_config('request.jwt.claims','{}',false);
select public.fin_job_begin('renewals','parallel-resilience-a',now(),90) is not null;
\echo lease-held
select pg_sleep(2);
commit;
SQL
: > "$work/holder.log"
psql "$url" -X -A -t -v ON_ERROR_STOP=1 -f "$work/holder.sql" > "$work/holder.log" &
holder=$!
ready=0
for _ in $(seq 1 100); do
  if [[ "$(< "$work/holder.log")" == *lease-held* ]]; then ready=1; break; fi
  sleep 0.02
done
test "$ready" -eq 1
contender=$(psql "$url" -X -A -t -v ON_ERROR_STOP=1 -c "select public.fin_job_begin('renewals','parallel-resilience-b',now(),90) is null")
test "$contender" = "t"
wait "$holder"
psql "$url" -X -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
  if (select count(*) from public.fin_job_runs where request_id in ('parallel-resilience-a','parallel-resilience-b')) <> 1 then raise exception 'duplicate concurrent job'; end if;
end $$;
select public.fin_job_finish(run_id,lease_token,'succeeded',0,0,null) from public.fin_job_leases where job='renewals';
SQL
printf 'Job lease contention: one run, contender busy, fenced completion passed.\n'

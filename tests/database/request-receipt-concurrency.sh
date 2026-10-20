#!/usr/bin/env bash
# Criação de RFQ idempotente sob concorrência (docs/supabase-financial-request-receipts.sql):
# seis envios simultâneos com a mesma chave gravam exatamente uma RFQ.
set -euo pipefail
url="$1"
node --input-type=module -e 'const u=new URL(process.argv[1]); if(!["postgres:","postgresql:"].includes(u.protocol)||!["localhost","127.0.0.1","[::1]"].includes(u.hostname)||u.search||u.hash) throw new Error("Concurrency test requires disposable loopback database without connection overrides");' "$url"
logs=$(mktemp -d)
trap 'rm -rf "$logs"' EXIT
org=00000000-0000-4000-8000-00000000d711
user=00000000-0000-4000-8000-00000000d701
key=5f0e6c2a-1d3b-4c9e-8a7f-0b1c2d3e4f5a
psql "$url" -X -q -v ON_ERROR_STOP=1 <<SQL
insert into auth.users(id,email) values('$user','rr-concurrent@example.invalid') on conflict do nothing;
insert into public.fin_organizations(id,legal_name,kind,created_by) values('$org','Recibos concorrentes DEMO','BUYER','$user');
insert into public.fin_members(organization_id,user_id,role) values('$org','$user','finance_manager');
SQL
create="begin; set local role authenticated; select set_config('request.jwt.claim.sub','$user',true); select set_config('request.headers','{\"x-arandu-request-key\":\"$key\"}',true); select public.fin_create_rfq('$org','credit','Concorrente DEMO',null,'{}'::jsonb,null); select pg_sleep(0.5); commit;"
pids=()
for n in 1 2 3 4 5 6; do
  psql "$url" -X -q -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -c "$create" >"$logs/$n.out" 2>"$logs/$n.err" & pids+=($!)
done
success=0; duplicates=0; unexpected=0
for n in 1 2 3 4 5 6; do
  if wait "${pids[$((n-1))]}"; then success=$((success+1))
  elif grep -Eq '^ERROR: +P0001: duplicate request$' "$logs/$n.err" && [ "$(grep -Ec '^(ERROR|FATAL|PANIC):' "$logs/$n.err")" = 1 ]; then duplicates=$((duplicates+1))
  else unexpected=$((unexpected+1)); fi
done
[ "$success|$duplicates|$unexpected" = '1|5|0' ] || { echo "Unexpected concurrency outcomes: committed=$success duplicate=$duplicates unexpected=$unexpected" >&2; exit 1; }
counts=$(psql "$url" -X -A -t -v ON_ERROR_STOP=1 -c "select
 (select count(*) from public.fin_rfqs where organization_id='$org'),
 (select count(*) from public.fin_request_receipts where actor_id='$user' and request_key='$key'),
 (select count(*) from public.fin_request_receipts r join public.fin_rfqs q on q.id=r.rfq_id and q.organization_id=r.organization_id where r.actor_id='$user' and r.request_key='$key' and r.organization_id='$org')")
[ "$counts" = '1|1|1' ] || { echo 'RFQ, receipt and committed reference did not reconcile' >&2; exit 1; }
printf 'Request receipt under concurrency: 1 commit, 5 classified duplicates, 0 unexpected failures; RFQ and receipt reconciled.\n'

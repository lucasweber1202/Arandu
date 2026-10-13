#!/usr/bin/env bash
# Criação de RFQ idempotente sob concorrência (docs/supabase-financial-request-receipts.sql):
# seis envios simultâneos com a mesma chave gravam exatamente uma RFQ.
set -euo pipefail
url="$1"
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
for _ in 1 2 3 4 5 6; do psql "$url" -X -q -c "$create" >/dev/null 2>&1 & pids+=($!); done
for pid in "${pids[@]}"; do wait "$pid" || true; done
count=$(psql "$url" -X -A -t -c "select count(*) from public.fin_rfqs where organization_id='$org'")
[ "$count" = "1" ] || { echo "mesma chave criou $count RFQs sob concorrência" >&2; exit 1; }
printf 'Request receipt under concurrency (6 envios com a mesma chave → 1 RFQ) passed.\n'

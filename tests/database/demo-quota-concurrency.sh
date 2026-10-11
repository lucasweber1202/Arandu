#!/usr/bin/env bash
# Quota de workspace da Demo sob concorrência (docs/supabase-financial-demo-pool.sql):
# seis transações simultâneas com quota 2 gravam exatamente 2 RFQs. Antes da
# DW-02 o gatilho contava sem serializar e a quota era ultrapassada.
# Também: um único controlador do pool por vez (lease), com renovação pelo dono.
set -euo pipefail
url="$1"
org=00000000-0000-4000-8000-0000000fa201
user=00000000-0000-4000-8000-0000000fa101
psql "$url" -X -q -v ON_ERROR_STOP=1 <<SQL
insert into public.fin_settings(key,value) values('deployment_environment','demo') on conflict(key) do update set value='demo';
insert into auth.users(id,email) values('$user','quota-fixture@example.invalid') on conflict do nothing;
insert into public.fin_organizations(id,legal_name,kind,created_by) values('$org','Quota concorrente','BUYER','$user');
insert into public.fin_demo_workspaces(slug,baseline_version,status,buyer_organization_id,user_ids,claim_token_hash,expires_at,idle_expires_at,quotas)
  values('fa2fa2fa2f','vitta-test','claimed','$org','{}',repeat('a',64),now()+interval '1 hour',now()+interval '1 hour','{"rfqs":2,"documents":0,"invites":0,"organizations":0}');
SQL
insert="begin; insert into public.fin_rfqs(organization_id,product,title,owner_id,status,demand) values('$org','credit','Quota concorrente','$user','draft','{}'); select pg_sleep(0.5); commit;"
pids=()
for _ in 1 2 3 4 5 6; do psql "$url" -X -q -c "$insert" >/dev/null 2>&1 & pids+=($!); done
for pid in "${pids[@]}"; do wait "$pid" || true; done
count=$(psql "$url" -X -A -t -c "select count(*) from public.fin_rfqs where organization_id='$org'")
[ "$count" = "2" ] || { echo "quota de workspace ultrapassada sob concorrência: $count RFQs com quota 2" >&2; exit 1; }
# Lease do controlador: o segundo dono é recusado; o primeiro renova; após liberar, outro adquire.
lease() { psql "$url" -X -A -t -v ON_ERROR_STOP=1 -c "select public.fin_demo_pool_lease('$1', 120)"; }
[ "$(lease controller-aaaa)" = "t" ] && [ "$(lease controller-bbbb)" = "f" ] && [ "$(lease controller-aaaa)" = "t" ] || { echo "lease do pool não é exclusivo" >&2; exit 1; }
psql "$url" -X -q -v ON_ERROR_STOP=1 -c "select public.fin_demo_pool_release('controller-aaaa')"
[ "$(lease controller-bbbb)" = "t" ] || { echo "lease liberado não pôde ser adquirido" >&2; exit 1; }
psql "$url" -X -q -v ON_ERROR_STOP=1 -c "select public.fin_demo_pool_release('controller-bbbb')" -c "update public.fin_demo_workspaces set status='expired' where slug='fa2fa2fa2f'"
printf 'Demo workspace quota under concurrency (6 writers, quota 2 → 2) and exclusive pool lease passed.\n'

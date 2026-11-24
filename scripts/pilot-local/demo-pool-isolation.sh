#!/usr/bin/env bash
# OPS-POOL-01/02 evidence on the LOCAL real stack (Supabase Auth + PostgREST +
# Postgres + app from `npm run demo:setup`). Never points at a hosted project:
# the seed/controller guards require ARANDU_DEMO_CONFIRM=local.
#
#   bash scripts/pilot-local/demo-pool-isolation.sh
#
# 1. provisions visitor A and claims it (valid session);
# 2. adds an expired workspace E;
# 3. starts a provisioning and cancels it (SIGTERM) -> failed + failed_at;
# 4. hashes every row of every public table with organization_id, plus the
#    workspace registry rows of baseline/A, and auth.users outside new slugs;
# 5. runs two controllers at once (one must skip on the lease);
# 6. re-hashes excluding ONLY organisations of workspaces created in step 5;
# 7. checks E and the cancelled workspace were cleaned, A still claimed, and
#    RLS isolation A <-> new visitor in both directions.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
state="$root/scripts/pilot-local/.state"
out="${ARANDU_EVIDENCE_DIR:-$root/reports/demo-pool-isolation}"
mkdir -p "$out"
set -a; . "$state/.env"; . "$state/demo.env"; set +a
export ARANDU_ENV=demo ARANDU_DEMO_CONFIRM=local SUPABASE_URL=https://localhost:8443 \
  SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" \
  ARANDU_DEMO_APP_URL=https://localhost:4443 CRON_SECRET="$CRON_SECRET" NODE_EXTRA_CA_CERTS="$state/cert.pem"
db="postgresql://postgres:$PGPW@localhost:54322/postgres"
q() { psql "$db" -v ON_ERROR_STOP=1 -qtAc "$1"; }
step() { echo "== $*"; }

snapshot() { # $1 = comma list of excluded org ids ('' for none) ; $2 = file
  psql "$db" -v ON_ERROR_STOP=1 -qtA -v ex="{$1}" > "$2" <<'SQL'
do $$ begin perform 1; end $$;
select c.table_name || ' ' || (xpath('/row/n/text()', query_to_xml(format('select count(*) n from public.%I where not (organization_id = any(%L::uuid[]))', c.table_name, :'ex'), false, true, '')))[1]::text
  || ' ' || (xpath('/row/d/text()', query_to_xml(format('select coalesce(md5(string_agg(md5(x::text), '','' order by md5(x::text))), ''-'') d from public.%I x where not (organization_id = any(%L::uuid[]))', c.table_name, :'ex'), false, true, '')))[1]::text
from information_schema.columns c join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
where c.table_schema = 'public' and c.column_name = 'organization_id' order by 1;
SQL
}

step "1. visitor A"
node scripts/demo/workspaces.mjs provision --count=1 --concurrency=1 | tee "$out/provision-a.log"
slug_a=$(q "select slug from fin_demo_workspaces where status='ready' order by ready_at desc limit 1")
token_hash=$(node -e 'console.log(require("node:crypto").createHash("sha256").update("visitor-a-evidence").digest("hex"))')
q "select public.fin_demo_workspace_claim('$token_hash', 240, 1440, 25)" >/dev/null
test "$(q "select status from fin_demo_workspaces where slug='$slug_a'")" = claimed

step "2. expired workspace E"
q "insert into fin_demo_workspaces(slug,baseline_version,status,claim_token_hash,claimed_at,expires_at,idle_expires_at) values ('eeeeeeeeee','vitta-2026-10','claimed',repeat('e',64),now()-interval '2 days',now()-interval '1 day',now()-interval '1 day')"

step "3. cancelled provisioning"
slug_c=cccccccccc
ARANDU_DEMO_WORKSPACE=$slug_c node scripts/demo/seed.mjs --quiet > "$out/cancelled.log" 2>&1 & pid=$!
until [ "$(q "select count(*) from fin_demo_workspaces where slug='$slug_c' and heartbeat_at is not null")" = 1 ]; do sleep 2; done
sleep 20; kill -TERM "$pid"; wait "$pid" || true
test "$(q "select status || ':' || (failed_at is not null) from fin_demo_workspaces where slug='$slug_c'")" = "failed:true"

step "4. snapshot before"
before_slugs=$(q "select string_agg(slug, ',') from fin_demo_workspaces")
c_orgs=$(q "select coalesce(array_to_string(public.fin_demo_workspace_orgs('$slug_c'), ','), '')")
snapshot "$c_orgs" "$out/before.txt"
q "select slug, status, claim_token_hash, expires_at from fin_demo_workspaces where slug='$slug_a'" > "$out/a-before.txt"
q "select md5(string_agg(id::text || email, ',' order by id)) from auth.users" > "$out/users-before.txt"

step "5. two controllers at once"
node scripts/demo/workspaces.mjs maintain > "$out/controller-1.json" 2> "$out/controller-1.err" & c1=$!
sleep 3
node scripts/demo/workspaces.mjs maintain > "$out/controller-2.json" 2> "$out/controller-2.err" & c2=$!
wait "$c1" || true; wait "$c2" || true
cat "$out/controller-1.json" "$out/controller-2.json"
grep -q '"skipped"' "$out/controller-1.json" "$out/controller-2.json"

step "6. snapshot after (excluding only new workspaces' organisations)"
new_orgs=$(q "select coalesce(string_agg(o::text, ','), '') from fin_demo_workspaces w, unnest(public.fin_demo_workspace_orgs(w.slug)) o where w.slug <> all(string_to_array('$before_slugs', ','))")
snapshot "${new_orgs}${new_orgs:+${c_orgs:+,}}${c_orgs}" "$out/after.txt"
diff <(grep -v '^$' "$out/before.txt") <(grep -v '^$' "$out/after.txt") > "$out/diff.txt" && echo "ISOLATION: no row outside the new workspaces changed" || { echo "ISOLATION FAILED"; cat "$out/diff.txt"; exit 1; }
q "select slug, status, claim_token_hash, expires_at from fin_demo_workspaces where slug='$slug_a'" > "$out/a-after.txt"
diff "$out/a-before.txt" "$out/a-after.txt"
test "$(q "select count(*) from fin_demo_workspaces where slug in ('eeeeeeeeee','$slug_c')")" = 0

step "7. RLS isolation A <-> new visitor (both directions)"
slug_b=$(q "select slug from fin_demo_workspaces where status='ready' order by ready_at desc limit 1")
user_a=$(q "select id from auth.users where email like 'helena+ws-$slug_a@%'")
user_b=$(q "select id from auth.users where email like 'helena+ws-$slug_b@%'")
cross() { psql "$db" -qtA -c "begin; set local role authenticated; select set_config('request.jwt.claim.sub','$1',true); select count(*) from fin_rfqs r where r.organization_id = any(public.fin_demo_workspace_orgs('$2')); rollback;" | grep -E '^[0-9]+$'; }
test "$(cross "$user_a" "$slug_b")" = 0
test "$(cross "$user_b" "$slug_a")" = 0
test "$(cross "$user_a" "$slug_a")" -gt 0

echo "ready=$(q "select count(*) from fin_demo_workspaces where status='ready'") claimed=$(q "select count(*) from fin_demo_workspaces where status='claimed'")"

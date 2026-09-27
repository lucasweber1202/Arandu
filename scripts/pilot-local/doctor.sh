#!/usr/bin/env bash
# Roda `npm run finance:pilot:doctor` contra o ensaio local em quatro cenários:
# completo (esperado GO), incompleto (NO-GO), chave trocada (UNSAFE) e bucket
# público (UNSAFE; o bucket volta a ser privado ao final, aconteça o que acontecer).
# O doctor é somente leitura; só o cenário do bucket altera o ambiente, aqui.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
set -a; . "$here/.state/.env"; set +a
db="postgresql://postgres:${PGPW}@localhost:54322/postgres"
export ARANDU_ENV=pilot ARANDU_SITE_URL=https://localhost:4443 SUPABASE_URL=https://localhost:8443 \
  SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" CRON_SECRET="$CRON_SECRET" \
  NODE_EXTRA_CA_CERTS="$here/.state/cert.pem"
cd "$root"
failures=0
scenario() {
  local name="$1" expected="$2"; shift 2
  local output code
  output="$("$@" 2>&1)"; code=$?
  echo "== $name: exit $code (esperado $expected)"
  echo "$output" | grep -E '^\[(ERROR|UNSAFE)\]|^(GO|NO-GO|UNSAFE) ' || true
  [ "$code" = "$expected" ] || failures=$((failures + 1))
}
scenario "ambiente completo" 0 node scripts/finance-pilot-doctor.mjs
node scripts/finance-pilot-doctor.mjs --json > "$here/.state/doctor.json"; echo "JSON (ambiente completo): $here/.state/doctor.json"
scenario "sem service role e sem CRON_SECRET" 1 env -u SUPABASE_SERVICE_ROLE_KEY -u CRON_SECRET node scripts/finance-pilot-doctor.mjs
scenario "chave de serviço no lugar da anon" 2 env SUPABASE_ANON_KEY="$SERVICE_KEY" node scripts/finance-pilot-doctor.mjs
trap 'psql "$db" -q -c "update storage.buckets set public = false where id = '"'"'fin-documents'"'"'" >/dev/null' EXIT
psql "$db" -q -c "update storage.buckets set public = true where id = 'fin-documents'" >/dev/null
scenario "bucket de documentos público" 2 node scripts/finance-pilot-doctor.mjs
echo "cenários com código inesperado: $failures"
exit "$failures"

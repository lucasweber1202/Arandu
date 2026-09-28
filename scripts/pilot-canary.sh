#!/usr/bin/env bash
# Canário de isolamento entre tenants (somente leitura) contra o banco do piloto
# ou um restore dele. Sem PILOT_DATABASE_URL, usa o ensaio local.
# Saída 0 = nenhum vazamento; diferente de 0 = vazamento ou erro (não aprovar go-live).
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
url="${PILOT_DATABASE_URL:-}"
if [ -z "$url" ]; then
  state="$root/scripts/pilot-local/.state/.env"
  [ -f "$state" ] || { echo "Defina PILOT_DATABASE_URL ou rode npm run pilot:local:up." >&2; exit 1; }
  set -a; . "$state"; set +a
  url="postgresql://postgres:${PGPW}@localhost:54322/postgres"
fi
set +e
output="$(psql "$url" -X -q -v ON_ERROR_STOP=1 -f "$root/ops/sql/pilot-isolation-canary.sql" 2>&1)"; code=$?
set -e
printf '%s\n' "$output" | sed -E 's#postgres(ql)?://[^[:space:]]+#[DATABASE_URL]#g' | grep -E 'CANÁRIO|ERROR' || true
exit "$code"

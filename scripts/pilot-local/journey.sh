#!/usr/bin/env bash
# Jornada real do piloto contra o ambiente de scripts/pilot-local/up.sh.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
set -a; . "$here/.state/.env"; set +a
export PILOT_APP_URL=https://localhost:4443 SUPABASE_URL=https://localhost:8443 \
  SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" \
  PILOT_DB_URL="postgresql://postgres:${PGPW}@localhost:54322/postgres" \
  NODE_EXTRA_CA_CERTS="$here/.state/cert.pem" PILOT_REPORT="${PILOT_REPORT:-$here/.state/journey.md}"
exec node "$here/journey.mjs"

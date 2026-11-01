#!/usr/bin/env bash
# Jornada real das capacidades de plataforma contra o ambiente de scripts/pilot-local/up.sh
# (ou do npm run demo:setup). Sem modelo de IA nem ERP externos.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
set -a; . "$here/.state/.env"; set +a
export PILOT_APP_URL=https://localhost:4443 SUPABASE_URL=https://localhost:8443 \
  SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" \
  PILOT_DB_URL="postgresql://postgres:${PGPW}@localhost:54322/postgres" \
  NODE_EXTRA_CA_CERTS="$here/.state/cert.pem" PILOT_REPORT="${PILOT_REPORT:-$here/.state/platform-journey.json}"
exec node "$here/platform-journey.mjs"

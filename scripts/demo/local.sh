#!/usr/bin/env bash
# Demonstração canônica do Arandu na máquina local: o MESMO app da main, com
# ARANDU_ENV=demo, ligado ao Supabase local de scripts/pilot-local (Postgres,
# GoTrue, PostgREST e Storage reais, em Docker) e semeado com a Vitta Foods.
#
#   npm run demo:setup        # sobe o Supabase local, builda, sobe o app em modo demo e semeia
#   npm run demo:local:reset  # apaga só os dados da demo e semeia de novo
#   npm run demo:local:check  # só as checagens de sanidade
#   npm run demo:down         # derruba tudo e apaga o estado local
#
# Chaves, senha das personas e certificados são gerados a cada ambiente em
# scripts/pilot-local/.state/ (fora do git). Nada daqui serve para outro ambiente.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
state="$root/scripts/pilot-local/.state"
command="${1:-setup}"

ensure_password() {
  mkdir -p "$state"
  if [ ! -f "$state/demo.env" ]; then
    # Senha aleatória por ambiente local: forte o bastante para as travas e nunca versionada.
    node -e 'const c=require("node:crypto");console.log(`ARANDU_DEMO_PASSWORD=Vitta-${c.randomBytes(9).toString("base64url")}-${c.randomInt(10,99)}Aa`)' > "$state/demo.env"
    chmod 600 "$state/demo.env"
  fi
}

load_env() {
  [ -f "$state/.env" ] || { echo "Supabase local não encontrado. Rode npm run demo:setup."; exit 1; }
  set -a; . "$state/.env"; . "$state/demo.env"; set +a
  export ARANDU_ENV=demo ARANDU_DEMO_CONFIRM=local SUPABASE_URL=https://localhost:8443 \
    SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" \
    ARANDU_DEMO_APP_URL=https://localhost:4443 CRON_SECRET="$CRON_SECRET" \
    NODE_EXTRA_CA_CERTS="$state/cert.pem"
  unset VERCEL_ENV
}

start_app() {
  # (Re)inicia o servidor local do app em ARANDU_ENV=demo, com o build atual.
  # Qualquer app local anterior (inclusive o de up.sh); o padrão com colchetes
  # não casa com a linha de comando de quem procura.
  for pid in $(pgrep -f "pilot-local/app-serve[r].mjs" || true); do kill "$pid" 2>/dev/null || true; done
  for _ in $(seq 1 20); do pgrep -f "pilot-local/app-serve[r].mjs" >/dev/null || break; sleep 0.5; done
  ( cd "$root" && SUPABASE_URL=https://localhost:8443 SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" \
    ARANDU_SITE_URL=https://localhost:4443 ARANDU_ENV=demo CRON_SECRET="$CRON_SECRET" \
    NODE_EXTRA_CA_CERTS="$state/cert.pem" node scripts/pilot-local/app-server.mjs > "$state/app.log" 2>&1 & echo $! > "$state/app.pid" )
  for _ in $(seq 1 30); do curl -fsSk https://localhost:4443/api/health >/dev/null 2>&1 && return 0; sleep 1; done
  echo "O app local não respondeu em https://localhost:4443 (veja $state/app.log)."; exit 1
}

case "$command" in
  setup)
    ensure_password
    ( cd "$root" && npm run build >/dev/null )
    if ! curl -fsSk https://localhost:8443/auth/v1/health >/dev/null 2>&1; then
      PILOT_LOCAL_ARANDU_ENV=demo bash "$root/scripts/pilot-local/up.sh"
    fi
    load_env
    start_app
    node "$here/seed.mjs" --reset
    echo
    echo "Demonstração local: https://localhost:4443/login.html (certificado autoassinado)"
    echo "Senha das personas: veja ARANDU_DEMO_PASSWORD em scripts/pilot-local/.state/demo.env"
    ;;
  reset) load_env; node "$here/seed.mjs" --reset ;;
  check) load_env; node "$here/seed.mjs" --check ;;
  app) load_env; start_app; echo "App local em modo demo: https://localhost:4443" ;;
  down) bash "$root/scripts/pilot-local/down.sh" ;;
  *) echo "uso: bash scripts/demo/local.sh setup|reset|check|app|down"; exit 2 ;;
esac

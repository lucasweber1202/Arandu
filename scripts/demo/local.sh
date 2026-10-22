#!/usr/bin/env bash
# Demonstração canônica do Arandu na máquina local: o MESMO app da main, com
# ARANDU_ENV=demo, ligado ao Supabase local de scripts/pilot-local (Postgres,
# GoTrue, PostgREST e Storage reais, em Docker) e semeado com a Vitta Foods.
#
#   npm run demo:setup        # sobe o Supabase local, builda, sobe o app em modo demo e semeia
#   npm run demo:local:reset  # apaga só os dados da demo e semeia de novo
#   npm run demo:local:check  # só as checagens de sanidade
#   bash scripts/demo/local.sh readiness [--smoke]  # prontidão da apresentação (só lê)
#   bash scripts/demo/local.sh prepare-station [--provision]  # prepara a estação em ordem, sem reset
#   bash scripts/demo/local.sh resume   # retoma após reinício (sem apagar dados)
#   bash scripts/demo/local.sh station  # preflight da estação: READY|PREPARED|BLOCKED|UNSAFE
#   bash scripts/demo/local.sh freeze --station  # congela o SHA da apresentação nesta máquina
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
  # Capture at process startup; a later checkout must not relabel a running app.
  local app_commit
  app_commit="$(git -C "$root" rev-parse HEAD)"
  # (Re)inicia o servidor local do app em ARANDU_ENV=demo, com o build atual.
  # Qualquer app local anterior (inclusive o de up.sh); o padrão com colchetes
  # não casa com a linha de comando de quem procura. O subshell não herda a
  # saída de quem chamou: sem isso, `local.sh app | tee` nunca termina.
  for pid in $(pgrep -f "pilot-local/app-serve[r].mjs" || true); do kill "$pid" 2>/dev/null || true; done
  for _ in $(seq 1 20); do pgrep -f "pilot-local/app-serve[r].mjs" >/dev/null || break; sleep 0.5; done
  ( cd "$root" && SUPABASE_URL=https://localhost:8443 SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" \
    ARANDU_SITE_URL=https://localhost:4443 ARANDU_ENV=demo CRON_SECRET="$CRON_SECRET" \
    VERCEL_GIT_COMMIT_SHA="$app_commit" NODE_EXTRA_CA_CERTS="$state/cert.pem" node scripts/pilot-local/app-server.mjs > "$state/app.log" 2>&1 & echo $! > "$state/app.pid" ) </dev/null >/dev/null 2>&1
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
  resume)
    # Retomada SEM apagar nada (máquina reiniciada, Docker parado, app caído): sobe
    # os contêineres existentes, o gateway e o app, e confere o seed. Nunca cria
    # contêiner novo: se o banco sumiu, os dados sumiram com ele (use setup).
    load_env
    for name in db auth rest storage; do
      docker inspect "arandu-pilot-local-$name-1" >/dev/null 2>&1 || { echo "Contêiner arandu-pilot-local-$name-1 ausente: os dados da Demo estavam nele. Rode npm run demo:setup (≈ 20 min)."; exit 1; }
    done
    docker start arandu-pilot-local-db-1 arandu-pilot-local-auth-1 arandu-pilot-local-rest-1 arandu-pilot-local-storage-1 >/dev/null
    for _ in $(seq 1 60); do [ "$(docker inspect -f '{{.State.Health.Status}}' arandu-pilot-local-db-1)" = healthy ] && break; sleep 2; done
    [ "$(docker inspect -f '{{.State.Health.Status}}' arandu-pilot-local-db-1)" = healthy ] || { echo "O banco não ficou saudável em 2 min (docker logs arandu-pilot-local-db-1)."; exit 1; }
    if ! curl -fsSk https://localhost:8443/auth/v1/health >/dev/null 2>&1; then
      for pid in $(pgrep -f "pilot-local/gatewa[y].mjs" || true); do kill "$pid" 2>/dev/null || true; done
      ( cd "$root" && node scripts/pilot-local/gateway.mjs > "$state/gateway.log" 2>&1 & echo $! > "$state/gateway.pid" ) </dev/null >/dev/null 2>&1
      for _ in $(seq 1 30); do curl -fsSk https://localhost:8443/auth/v1/health >/dev/null 2>&1 && break; sleep 1; done
    fi
    curl -fsSk https://localhost:8443/auth/v1/health >/dev/null 2>&1 || { echo "Gateway HTTPS não respondeu (veja $state/gateway.log)."; exit 1; }
    curl -fsSk https://localhost:4443/api/health >/dev/null 2>&1 || start_app
    node "$here/seed.mjs" --check
    node "$here/workspaces.mjs" list
    ;;
  prepare-station)
    # Prepara a estação em ordem, sem reset: requisitos da máquina → dependências do
    # lockfile → stack (retoma a existente; só cria numa máquina sem nenhum estado)
    # → pool (só com --provision) → prontidão → veredito. Pode rodar de novo.
    shift; provision=0
    for arg in "$@"; do case "$arg" in --provision) provision=1 ;; *) echo "opção desconhecida: $arg"; exit 2 ;; esac; done
    echo "== 1/6 Dependências locais (lockfile)"
    if [ ! -f "$root/node_modules/.package-lock.json" ]; then ( cd "$root" && npm ci --include=optional ); fi
    ( cd "$root" && node -e "const {chromium}=require('@playwright/test');process.exit(require('fs').existsSync(chromium.executablePath())?0:1)" ) \
      || ( cd "$root" && npx playwright install chromium )
    echo "== 2/6 Requisitos da máquina"
    node "$here/station.mjs" --fast --gate=host || exit $?
    echo "== 3/6 Stack local"
    if docker inspect arandu-pilot-local-db-1 >/dev/null 2>&1; then
      echo "Stack existente: retomando sem apagar dados."
      bash "$here/local.sh" resume || exit 1
    elif [ ! -f "$state/.env" ]; then
      echo "Máquina sem Demo: criando do zero (≈ 20 min; não há dados a perder)."
      bash "$here/local.sh" setup || exit 1
    else
      echo "Há estado local ($state) mas o contêiner do banco sumiu: os dados da Demo foram com ele."
      echo "Nada foi feito. Para recriar do zero, conscientemente: npm run demo:down && npm run demo:setup"
      exit 1
    fi
    load_env
    echo "== 4/6 Pool de visitantes"
    ready="$(docker exec arandu-pilot-local-db-1 psql -U postgres -Atc "select count(*) from public.fin_demo_workspaces where status = 'ready'")"
    if [ "${ready:-0}" -ge 4 ]; then echo "Pool: $ready pronto(s)."
    elif [ "$provision" = 1 ]; then
      echo "Pool: $ready pronto(s); provisionando $((4 - ready)) (≈ 11 min por lote de 2)."
      node "$here/workspaces.mjs" provision --count=$((4 - ready)) || exit 1
    else
      echo "Pool: $ready pronto(s) (meta 4). Rode de novo com --provision para completar (≈ 11 min por lote de 2)."
    fi
    echo "== 5/6 Prontidão (só lê)"
    node "$here/readiness.mjs" --smoke || true
    echo "== 6/6 Veredito da estação"
    node "$here/station.mjs"
    ;;
  station) shift; node "$here/station.mjs" "$@" ;;
  freeze) shift; node "$here/station.mjs" freeze "$@" ;;
  password) ensure_password ;;
  reset) load_env; node "$here/seed.mjs" --reset ;;
  check) load_env; node "$here/seed.mjs" --check ;;
  readiness) shift; load_env; node "$here/readiness.mjs" "$@" ;;
  app) load_env; start_app; echo "App local em modo demo: https://localhost:4443" ;;
  workspaces) shift; load_env; node "$here/workspaces.mjs" "$@" ;;
  down) bash "$root/scripts/pilot-local/down.sh" ;;
  *) echo "uso: bash scripts/demo/local.sh setup|prepare-station|resume|station|freeze|password|reset|check|readiness|app|workspaces|down"; exit 2 ;;
esac

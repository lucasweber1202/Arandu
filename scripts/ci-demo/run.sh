#!/usr/bin/env bash
# Integração efêmera da Demo canônica: Supabase real (Postgres, GoTrue,
# PostgREST, Storage) em Docker + app do Arandu em ARANDU_ENV=demo + Vitta Foods,
# tudo no runner. Reaproveita os scripts oficiais (scripts/pilot-local,
# scripts/demo); este arquivo só ordena as fases, impõe limites e coleta
# evidência. Usado por .github/workflows/demo-integration.yml e localmente:
#
#   bash scripts/ci-demo/run.sh preflight|images|up|smoke|seed|check|e2e <projeto>|journey|evidence|down
#
# Nada aqui lê secret do GitHub nem aponta para Supabase hospedado: chaves,
# senhas e certificados são gerados por execução em scripts/pilot-local/.state.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
state="$root/scripts/pilot-local/.state"
out="${CI_DEMO_REPORTS:-$root/reports/ci-demo}"
phase="${1:-}"
mkdir -p "$out"

# Identidade fixa das imagens: tag + digest do índice multi-arquitetura. O mesmo
# digest está no ECR público e no Docker Hub; o fallback não troca de imagem.
images=(
  "DB|supabase/postgres:15.14.1.064|sha256:0958922e6d801e4264ada02e6d6c454127a0721bb475f901e79b7eab74fb7493"
  "AUTH|supabase/gotrue:v2.181.0|sha256:1e13a79f256dacfa44129d90efd1f69fa4905711198c49d74d4f3227a011f5d2"
  "REST|supabase/postgrest:v12.2.9|sha256:3909ac0fe3d705a498c7ffbe96c1d8a02637aee214a24f0d1f57e93187c548cf|postgrest/postgrest:v12.2.9"
  "STORAGE|supabase/storage-api:v1.25.3|sha256:5d12f8a449c09c0a0a1dae97c9d1dcc907aeeb06a6d74e432243eabc8c61c47c"
)
images_env="$state/images.env"

local_env() {
  [ -f "$state/.env" ] || { echo "stack local ausente (rode a fase up)"; exit 1; }
  set -a; . "$state/.env"; [ -f "$state/demo.env" ] && . "$state/demo.env"; set +a
  export ARANDU_ENV=demo ARANDU_DEMO_CONFIRM=local SUPABASE_URL=https://localhost:8443 \
    SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" \
    ARANDU_DEMO_APP_URL=https://localhost:4443 PILOT_APP_URL=https://localhost:4443 \
    PILOT_DB_URL="postgresql://postgres:${PGPW}@localhost:54322/postgres" \
    NODE_EXTRA_CA_CERTS="$state/cert.pem"
  unset VERCEL_ENV VERCEL_URL
  node "$here/assert-local.mjs" "$phase"
}

# O limitador de tentativas de login do app é por processo fora da Vercel
# (api/[...path].js). As fases se autenticam muitas vezes a partir do mesmo IP;
# cada fase começa com o app reiniciado pelo caminho oficial, como um deploy
# novo, em vez de afrouxar o limite.
fresh_app() { bash "$root/scripts/demo/local.sh" app; }

mem_mb() { awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo; }
disk_gb() { df -Pk "${1:-$root}" | awk 'NR==2 {print int($4/1048576)}'; }
resources() {
  echo "memória disponível: $(mem_mb) MB · disco livre: $(disk_gb) GB · CPUs: $(nproc)"
  docker stats --no-stream --format '  {{.Name}} cpu={{.CPUPerc}} mem={{.MemUsage}}' 2>/dev/null || echo '  docker stats indisponível'
}

case "$phase" in
  preflight)
    min_mem="${CI_DEMO_MIN_MEM_MB:-6000}"; min_disk="${CI_DEMO_MIN_DISK_GB:-12}"
    mem="$(mem_mb)"; disk="$(disk_gb)"
    echo "memória disponível: ${mem} MB (mínimo ${min_mem}) · disco livre: ${disk} GB (mínimo ${min_disk}) · CPUs: $(nproc)" | tee "$out/preflight.txt"
    docker version --format 'Docker {{.Server.Version}}'; docker compose version; psql --version; node --version
    [ "$mem" -ge "$min_mem" ] || { echo "memória insuficiente para Supabase + app + Chromium"; exit 1; }
    [ "$disk" -ge "$min_disk" ] || { echo "disco insuficiente para as imagens (~7 GB descompactadas)"; exit 1; }
    ;;
  images)
    mkdir -p "$state"; : > "$images_env"
    for entry in "${images[@]}"; do
      IFS='|' read -r key name digest hub <<< "$entry"
      chosen=""
      # ECR público primeiro (o mesmo da stack self-hosted); se recusar por cota,
      # Docker Hub com o MESMO digest. Falha de registry não é falha do Arandu,
      # mas também não é escondida: sem imagem, a fase falha.
      for ref in "public.ecr.aws/${name}@${digest}" "docker.io/${hub:-$name}@${digest}"; do
        if timeout 600 docker pull -q "$ref" >/dev/null; then chosen="$ref"; break; fi
        echo "pull recusado: $ref"
      done
      [ -n "$chosen" ] || { echo "imagem indisponível: $name@$digest"; exit 1; }
      echo "PILOT_LOCAL_${key}_IMAGE=$chosen" >> "$images_env"
      echo "$key $chosen $(docker image inspect "$chosen" --format '{{.Size}}' | awk '{printf "%.0f MB", $1/1048576}')"
    done
    ;;
  up)
    set -a; . "$images_env"; set +a
    [ -d "$root/dist" ] || { echo "dist/ ausente: rode npm run build antes"; exit 1; }
    timeout 600 env PILOT_LOCAL_ARANDU_ENV=demo bash "$root/scripts/pilot-local/up.sh" | grep -v '^migration aplicada' || exit 1
    echo "migrations aplicadas: $(node -p "require('$root/docs/supabase-migrations.json').cleanInstall.length")"
    bash "$root/scripts/demo/local.sh" password
    local_env; fresh_app
    for service in db auth rest storage; do
      echo "$service: $(docker compose -p arandu-pilot-local ps "$service" --format '{{.Image}} {{.State}} {{.Health}}')"
    done
    resources
    ;;
  smoke) local_env; timeout 300 node "$here/smoke.mjs" ;;
  seed) local_env; fresh_app; timeout 1500 node "$root/scripts/demo/seed.mjs" --reset ;;
  check) local_env; fresh_app; timeout 300 node "$root/scripts/demo/seed.mjs" --check ;;
  e2e)
    project="${2:?projeto do Playwright (demo-desktop|demo-mobile)}"
    local_env; fresh_app
    # Só Chromium, um worker, sem trace (o trace guardaria cookies de sessão).
    timeout 900 npx playwright test --config playwright.demo.config.js --project "$project" --workers 1 --trace off
    resources
    ;;
  journey)
    local_env; fresh_app
    PILOT_REPORT="$out/journey.md" timeout 900 node "$root/scripts/pilot-local/journey.mjs"
    ;;
  evidence)
    # Logs dos serviços (só as últimas linhas) e do app, sanitizados.
    for service in db auth rest storage; do
      docker compose -p arandu-pilot-local logs --no-color --tail 300 "$service" > "$state/$service.log" 2>&1 || echo "logs de $service indisponíveis"
    done
    node "$here/sanitize.mjs" "$out/logs" "$state/app.log" "$state/gateway.log" "$state/db.log" "$state/auth.log" "$state/rest.log" "$state/storage.log"
    [ -f "$images_env" ] && cp "$images_env" "$out/images.env"
    resources | tee "$out/resources-final.txt"
    ;;
  down)
    bash "$root/scripts/pilot-local/down.sh"
    left="$(docker ps -aq --filter label=com.docker.compose.project=arandu-pilot-local | wc -l)"
    echo "containers restantes do projeto: $left"; [ "$left" = 0 ]
    ;;
  *) echo "uso: bash scripts/ci-demo/run.sh preflight|images|up|smoke|seed|check|e2e <projeto>|journey|evidence|down"; exit 2 ;;
esac

#!/usr/bin/env bash
# Prepara o WSL2 (Ubuntu 24.04) como executor de recovery do Arandu e inicia o
# orquestrador (docs/ops/RECOVERY_ORCHESTRATOR.md). Pede autorização antes de
# CADA instalação; nunca pede, lê ou grava credenciais (o orquestrador pergunta
# em entrada oculta). Reexecutável: o que já existe é só verificado.
#
#   bash scripts/recovery/wsl-bootstrap.sh [--check-only] [--expect-sha=<40 hex>]
set -euo pipefail
check_only=0; expect_sha=""
for arg in "$@"; do case "$arg" in --check-only) check_only=1 ;; --expect-sha=*) expect_sha="${arg#*=}" ;; *) echo "argumento desconhecido: $arg" >&2; exit 2 ;; esac; done
for arg in "$@"; do case "$arg" in *postgres*://*|*eyJ*|*password*) echo "Recusado: credenciais nunca por argumento." >&2; exit 2 ;; esac; done

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
base="${ARANDU_RECOVERY_HOME:-$HOME/arandu-recovery}"
say() { printf '\n== %s\n' "$*"; }
ask() { local a; read -r -p "$1 [s/N] " a </dev/tty; [[ "$a" =~ ^[sS]$ ]]; }
need_sudo_install() { # $1 descrição; resto: comando
  local what="$1"; shift
  if [ "$check_only" = 1 ]; then echo "  falta: $what"; return 1; fi
  ask "Instalar $what? (usa sudo; você verá o pedido de senha do Linux)" || { echo "  não instalado: $what"; return 1; }
  "$@"
}

say "Ambiente"
grep -qi microsoft /proc/version 2>/dev/null && echo "  WSL detectado" || echo "  Aviso: não parece WSL; o procedimento serve para qualquer Linux persistente."
. /etc/os-release 2>/dev/null || true
echo "  Distribuição: ${PRETTY_NAME:-desconhecida}"
case "$repo" in /mnt/[a-z]/*) echo "  ERRO: o repositório está em $repo (disco do Windows, sem permissões POSIX). Clone dentro do WSL (ex.: ~/arandu)." >&2; exit 1 ;; esac
mem_gb=$(awk '/MemTotal/{printf "%d", $2/1024/1024}' /proc/meminfo)
free_gb=$(df -Pk "$HOME" | awk 'NR==2{printf "%d", $4/1024/1024}')
echo "  Memória: ${mem_gb} GiB (mínimo 4)  Disco livre em \$HOME: ${free_gb} GiB (mínimo 20)"
[ "$mem_gb" -ge 4 ] || echo "  Ajuste: crie %UserProfile%\\.wslconfig com [wsl2] memory=6GB e rode 'wsl --shutdown'."
[ "$free_gb" -ge 20 ] || { echo "  ERRO: libere espaço no disco do WSL." >&2; exit 1; }

say "Repositório"
cd "$repo"
head_sha="$(git rev-parse HEAD)"
echo "  HEAD $head_sha"
if [ -n "$expect_sha" ] && [ "$head_sha" != "$expect_sha" ]; then echo "  ERRO: HEAD difere do SHA revisado esperado." >&2; exit 1; fi
[ -z "$(git status --porcelain)" ] || echo "  Aviso: há alterações locais no checkout; use o código revisado da main."

say "Ferramentas"
missing=0
command -v openssl >/dev/null || need_sudo_install "openssl" sudo apt-get install -y openssl || missing=1
if ! command -v age >/dev/null || ! command -v age-keygen >/dev/null; then need_sudo_install "age (criptografia do backup)" bash -c 'sudo apt-get update -q && sudo apt-get install -y age' || missing=1; fi
pg17() { for b in pg_dump pg_restore psql; do "$b" --version 2>/dev/null | grep -q ' 17\.' || return 1; done; }
if ! pg17 && [ -x /usr/lib/postgresql/17/bin/pg_dump ]; then export PATH="/usr/lib/postgresql/17/bin:$PATH"; fi
if ! pg17; then
  need_sudo_install "postgresql-client-17 (repositório oficial PGDG)" bash -c '
    sudo apt-get install -y -q curl ca-certificates gnupg >/dev/null &&
    sudo install -d /usr/share/postgresql-common/pgdg &&
    sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc &&
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release; echo $VERSION_CODENAME)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null &&
    sudo apt-get update -q && sudo apt-get install -y postgresql-client-17' || missing=1
  export PATH="/usr/lib/postgresql/17/bin:$PATH"
fi
if ! docker info >/dev/null 2>&1; then
  echo "  Docker indisponível no WSL."
  echo "  Opção A (recomendada): Docker Desktop > Settings > Resources > WSL integration > ative esta distribuição."
  if need_sudo_install "Docker Engine dentro do WSL (docker.io), alternativa ao Docker Desktop" bash -c 'sudo apt-get install -y docker.io && sudo usermod -aG docker "$USER" && (sudo service docker start || true)'; then
    echo "  Feche e reabra o terminal do WSL para o grupo docker valer, depois rode este bootstrap de novo."; exit 1
  fi
  missing=1
fi
node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$node_major" -lt 22 ]; then
  if [ "$check_only" = 1 ]; then echo "  falta: Node 24"; missing=1
  elif ask "Instalar Node 24 para o seu usuário via nvm (sem sudo)?"; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash >/dev/null
    export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm install 24 >/dev/null; nvm use 24 >/dev/null
  else missing=1; fi
fi
[ "$missing" = 0 ] || { echo; echo "Faltam ferramentas: nada foi executado contra o banco." >&2; exit 1; }
[ -d node_modules ] || npm ci --ignore-scripts --no-audit --no-fund >/dev/null

say "Diretórios privados (disco persistente do WSL, fora do repositório)"
install -d -m 700 "$base" "$base/keys"
chmod 700 "$base" "$base/keys"
export ARANDU_RECOVERY_DIRECTORY="$base/store"
export ARANDU_RECOVERY_IDENTITY_FILE="$base/keys/identity.age"
echo "  store:      $ARANDU_RECOVERY_DIRECTORY"
echo "  identidade: $ARANDU_RECOVERY_IDENTITY_FILE (separada do store)"
echo "  Lembre: o disco do WSL some se a distribuição for desinstalada. Mantenha cópia offline da identidade e, se quiser, do store."

say "Diagnóstico do executor"
node scripts/recovery/orchestrate.mjs check || { echo "Executor incompleto." >&2; exit 1; }
[ "$check_only" = 1 ] && exit 0

say "Procedimento"
echo "  O orquestrador vai pedir, em entrada oculta, a conexão PostgreSQL (Session pooler, porta 5432) e a chave service_role da Demo,"
echo "  e vai parar para você atestar o store, confirmar a custódia da identidade e autorizar o export. Nenhuma migration é aplicada."
ask "Iniciar agora?" || exit 0
exec node scripts/recovery/orchestrate.mjs run --until=release-gate

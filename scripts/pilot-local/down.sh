#!/usr/bin/env bash
# Derruba apenas o ensaio local e preserva estado se a limpeza falhar.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project=arandu-pilot-local

# O app também pode iniciar com caminho relativo. Confere argv E cwd para não
# encerrar processos de outra worktree ou um PID reaproveitado pelo sistema.
for proc in /proc/[0-9]*; do
  [ -r "$proc/cmdline" ] || continue
  args="$(tr '\0' '\n' < "$proc/cmdline" 2>/dev/null)" || continue
  owned=false
  while IFS= read -r arg; do
    case "$arg" in
      "$here/app-server.mjs"|"$here/gateway.mjs") owned=true ;;
      scripts/pilot-local/app-server.mjs|scripts/pilot-local/gateway.mjs)
        if [ "$(readlink "$proc/cwd" 2>/dev/null)" = "$(cd "$here/../.." && pwd)" ]; then owned=true; fi ;;
    esac
  done <<< "$args"
  if [ "$owned" = true ]; then
    pid="${proc##*/}"
    if ! kill "$pid" 2>/dev/null && [ -d "$proc" ]; then
      echo "Não foi possível encerrar processo local; estado preservado." >&2
      exit 1
    fi
  fi
done

if ! docker compose -p "$project" -f "$here/docker-compose.yml" down -v --remove-orphans; then
  echo "Falha no teardown Docker; estado preservado para retomada." >&2
  exit 1
fi
# Compose pode concluir sem remover um volume em uso. Nenhum recurso do
# projeto pode sobreviver antes de apagar credenciais e certificados locais.
for kind in container volume network; do
  case "$kind" in
    container) remaining="$(docker ps -aq --filter "label=com.docker.compose.project=$project")" ;;
    volume) remaining="$(docker volume ls -q --filter "label=com.docker.compose.project=$project")" ;;
    network) remaining="$(docker network ls -q --filter "label=com.docker.compose.project=$project")" ;;
  esac
  if [ -n "$remaining" ]; then
    echo "Recurso Docker residual ($kind); estado preservado para retomada." >&2
    exit 1
  fi
done
rm -rf "$here/.state"

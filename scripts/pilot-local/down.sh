#!/usr/bin/env bash
# Derruba o ensaio local e apaga chaves, certificados e dados gerados.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for pid in app gateway; do [ -f "$here/.state/$pid.pid" ] && kill "$(cat "$here/.state/$pid.pid")" 2>/dev/null || true; done
# Processos de execuções anteriores cujo pid já foi sobrescrito.
for pid in $(pgrep -f "pilot-local/(app-serve[r]|gatewa[y]).mjs" || true); do kill "$pid" 2>/dev/null || true; done
docker compose -p arandu-pilot-local -f "$here/docker-compose.yml" down -v --remove-orphans 2>/dev/null || true
rm -rf "$here/.state"

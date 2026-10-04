#!/usr/bin/env bash
# Retenção concorrente (docs/supabase-financial-data-governance.sql): enquanto
# uma execução real segura o lock, a segunda falha como "job busy" em vez de
# apagar em paralelo; o export é reivindicado por um único worker (skip locked).
set -euo pipefail
url="$1"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cat > "$work/holder.sql" <<'SQL'
begin;
select set_config('request.jwt.claim.sub','',false);
select set_config('request.jwt.claims','{}',false);
select (public.fin_governance_retention_run(false, 10, null, 'parallel-gov-a')->>'dry_run') = 'false';
\echo retention-held
select pg_sleep(2);
commit;
SQL
psql "$url" -X -A -t -v ON_ERROR_STOP=1 -f "$work/holder.sql" > "$work/holder.log" &
holder=$!
ready=0
for _ in $(seq 1 100); do
  if [[ "$(< "$work/holder.log")" == *retention-held* ]]; then ready=1; break; fi
  sleep 0.02
done
test "$ready" -eq 1
if contender=$(psql "$url" -X -A -t -v ON_ERROR_STOP=1 -c "select public.fin_governance_retention_run(false, 10, null, 'parallel-gov-b')" 2>&1); then
  echo "retenção concorrente não foi recusada: $contender" >&2; exit 1
fi
[[ "$contender" == *"job busy"* ]] || { echo "falha inesperada: $contender" >&2; exit 1; }
# Preview (dry-run) não disputa o lock de escrita.
psql "$url" -X -A -t -v ON_ERROR_STOP=1 -c "select public.fin_governance_retention_run(true, 10, null, null)" > /dev/null
wait "$holder"
printf 'Governance retention contention: one writer, contender busy, preview unaffected passed.\n'

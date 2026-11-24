#!/usr/bin/env bash
# Reconciliação de schema contra PostgreSQL REAL e descartável (Arandu 10.2).
# Usa o mesmo servidor do test:database (ARANDU_DATABASE_TEST_URL) e um banco
# próprio, criado e removido aqui. Nunca aponta para Supabase hospedado.
set -euo pipefail
base_url="${ARANDU_DATABASE_TEST_URL:-postgresql://postgres:postgres@localhost:5432/postgres}"
case "$base_url" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "Recusado: banco de teste precisa ser local."; exit 2 ;; esac
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
db="arandu_reconcile_test"
url="${base_url%/*}/$db"
psql "$base_url" -qv ON_ERROR_STOP=1 -c "drop database if exists $db;" -c "create database $db;"
trap 'psql "$base_url" -qc "drop database if exists $db;" >/dev/null 2>&1 || true' EXIT
apply() { psql "$url" -qv ON_ERROR_STOP=1 -f "$root_dir/$1" >/dev/null 2>&1 || { echo "falha ao aplicar $1"; exit 1; }; }
classify() { node "$root_dir/scripts/demo/schema-state.mjs" "$url"; }
expect() {
  local want="$1" got
  got="$(classify || true)"
  case "$got" in "$want"*) echo "ok - $2 → $got" ;; *) echo "FALHA - $2: esperado $want, obtido $got"; exit 1 ;; esac
}
apply tests/database/bootstrap.sql
expect "incremental" "banco vazio (só bootstrap)"
mapfile -t files < <(node -e "for (const f of require('$root_dir/docs/supabase-migrations.json').cleanInstall) console.log(f)")
last="${files[-1]}"
a10="${files[-2]}"
[ "$last" = "docs/supabase-financial-invite-integrity.sql" ] && [ "$a10" = "docs/supabase-financial-arandu-10.sql" ] || { echo "A última migration mudou ($last): revise este teste."; exit 1; }
for file in "${files[@]:0:${#files[@]}-2}"; do apply "$file"; done
expect "incremental pending=docs/supabase-financial-arandu-10.sql,docs/supabase-financial-invite-integrity.sql" "banco no estado anterior ao Arandu 10 (upgrade; schema_version prova a migration sem relação própria)"
psql "$url" -qc "update public.fin_settings set value='financial-operating-context-1' where key='schema_version'" >/dev/null
expect "incremental pending=docs/supabase-financial-contract-email-links.sql,docs/supabase-financial-arandu-10.sql,docs/supabase-financial-invite-integrity.sql" "marcador anterior: a migration sem relação volta ao plano (conservador)"
apply docs/supabase-financial-contract-email-links.sql
apply "$a10"
apply "$last"
expect "compatible" "após aplicar a pendente (upgrade incremental)"
apply "$last"
expect "compatible" "reaplicação idempotente do Arandu 10"
psql "$url" -qc "alter view public.fin_renewal_operations rename to fin_renewal_operations_hold" >/dev/null
expect "partial" "migration pela metade (view do Arandu 10 ausente)"
psql "$url" -qc "alter view public.fin_renewal_operations_hold rename to fin_renewal_operations" >/dev/null
psql "$url" -qc "create table public.fin_rogue(id int)" >/dev/null
expect "divergent reason=unexpected_relations" "relação fora do manifesto"
psql "$url" -qc "drop table public.fin_rogue" >/dev/null
psql "$url" -qc "update public.fin_settings set value='financial-unknown-9' where key='schema_version'" >/dev/null
expect "divergent reason=unknown_schema_version" "marcador de versão desconhecido"
psql "$url" -qc "update public.fin_settings set value='financial-invite-integrity-1' where key='schema_version'" >/dev/null
psql "$url" -qc "create table public.fin_rogue(id int)" >/dev/null
psql "$url" -qc "drop table public.fin_rogue" >/dev/null
expect "compatible" "estado restaurado"
echo "Reconciliação de schema em PostgreSQL real: OK"

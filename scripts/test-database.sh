#!/usr/bin/env bash
set -euo pipefail

base_url="${ARANDU_DATABASE_TEST_URL:-postgresql://postgres:postgres@localhost:5432/postgres}"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
clean_db="arandu_clean_test"
upgrade_db="arandu_upgrade_test"

psql "$base_url" -v ON_ERROR_STOP=1 -c "drop database if exists ${clean_db};"
psql "$base_url" -v ON_ERROR_STOP=1 -c "drop database if exists ${upgrade_db};"
psql "$base_url" -v ON_ERROR_STOP=1 -c "create database ${clean_db};"
psql "$base_url" -v ON_ERROR_STOP=1 -c "create database ${upgrade_db};"

database_url() {
  local name="$1"
  printf '%s/%s' "${base_url%/*}" "$name"
}

apply_file() {
  local database="$1"
  local file="$2"
  psql "$(database_url "$database")" -v ON_ERROR_STOP=1 -f "$root_dir/$file"
}

# Instalação limpa: aplica a sequência canônica inteira e valida contratos funcionais.
apply_file "$clean_db" "tests/database/bootstrap.sql"
while IFS= read -r file; do
  apply_file "$clean_db" "$file"
done < <(node -e "const m=require('./docs/supabase-migrations.json'); for (const f of m.cleanInstall) console.log(f)")
apply_file "$clean_db" "tests/database/transactions.sql"
apply_file "$clean_db" "tests/database/orders.sql"
bash "$root_dir/tests/database/reservation-concurrency.sh" "$(database_url "$clean_db")"
bash "$root_dir/tests/database/order-concurrency.sh" "$(database_url "$clean_db")"

# Upgrade: simula uma base que já possui transações, mas ainda não recebeu orders/hardening.
apply_file "$upgrade_db" "tests/database/bootstrap.sql"
while IFS= read -r file; do
  apply_file "$upgrade_db" "$file"
done < <(node -e "const m=require('./docs/supabase-migrations.json'); for (const f of m.cleanInstall.slice(0,-2)) console.log(f)")

apply_file "$upgrade_db" "docs/supabase-orders.sql"
apply_file "$upgrade_db" "docs/supabase-orders-hardening.sql"

# O hardening precisa ser reaplicável e ter rollback operacional verificável.
apply_file "$upgrade_db" "docs/supabase-orders-hardening.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-orders-hardening.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-orders-hardening.sql"

apply_file "$upgrade_db" "tests/database/transactions.sql"
apply_file "$upgrade_db" "tests/database/orders.sql"

echo "Arandu Database Integration Tests"
echo "Instalação limpa, upgrade, reaplicação, rollback, RLS, transações e pedidos aprovados."

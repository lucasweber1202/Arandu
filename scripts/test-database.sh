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

apply_file "$clean_db" "tests/database/bootstrap.sql"
while IFS= read -r file; do
  apply_file "$clean_db" "$file"
done < <(node -e "const m=require('./docs/supabase-migrations.json'); for (const f of m.cleanInstall) console.log(f)")
apply_file "$clean_db" "tests/database/transactions.sql"
apply_file "$clean_db" "tests/database/orders.sql"
apply_file "$clean_db" "tests/database/order-pr38-invariants.sql"
apply_file "$clean_db" "tests/database/email-outbox.sql"
apply_file "$clean_db" "tests/database/retention.sql"
apply_file "$clean_db" "tests/database/operational-status.sql"
apply_file "$clean_db" "tests/database/profile-access.sql"
apply_file "$clean_db" "tests/database/financial-procurement.sql"
apply_file "$clean_db" "tests/database/financial-procurement-hardening.sql"
apply_file "$clean_db" "tests/database/financial-pilot.sql"
apply_file "$clean_db" "tests/database/financial-enterprise-approvals.sql"
apply_file "$clean_db" "tests/database/financial-enterprise-drafts.sql"
apply_file "$clean_db" "tests/database/financial-collaboration.sql"
apply_file "$clean_db" "tests/database/financial-operational-search.sql"
# Reaplicação da migration financeira sobre a base já povoada: a rodada precisa
# ser idempotente antes de o rollback ser exercitado.
apply_file "$clean_db" "docs/supabase-financial-procurement.sql"
apply_file "$clean_db" "docs/supabase-financial-procurement-hardening.sql"
apply_file "$clean_db" "docs/supabase-financial-pilot.sql"
apply_file "$clean_db" "docs/supabase-financial-enterprise-approvals.sql"
apply_file "$clean_db" "docs/supabase-financial-enterprise-drafts.sql"
apply_file "$clean_db" "docs/supabase-financial-collaboration.sql"
apply_file "$clean_db" "docs/supabase-financial-operational-search.sql"
bash "$root_dir/tests/database/reservation-concurrency.sh" "$(database_url "$clean_db")"
bash "$root_dir/tests/database/order-concurrency.sh" "$(database_url "$clean_db")"

apply_file "$upgrade_db" "tests/database/bootstrap.sql"
while IFS= read -r file; do
  apply_file "$upgrade_db" "$file"
done < <(node -e "const m=require('./docs/supabase-migrations.json'); const i=m.cleanInstall.indexOf('docs/supabase-orders.sql'); for (const f of m.cleanInstall.slice(0,i)) console.log(f)")

apply_file "$upgrade_db" "docs/supabase-orders.sql"
apply_file "$upgrade_db" "docs/supabase-order-state-machine.sql"
apply_file "$upgrade_db" "docs/supabase-orders-hardening.sql"
apply_file "$upgrade_db" "docs/supabase-transactional-email-outbox.sql"
apply_file "$upgrade_db" "docs/supabase-retention-controls.sql"
apply_file "$upgrade_db" "docs/supabase-email-outbox-fencing.sql"

apply_file "$upgrade_db" "docs/supabase-orders-hardening.sql"
apply_file "$upgrade_db" "docs/supabase-transactional-email-outbox.sql"
apply_file "$upgrade_db" "docs/supabase-retention-controls.sql"
apply_file "$upgrade_db" "docs/supabase-email-outbox-fencing.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-email-outbox-fencing.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-retention-controls.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-transactional-email-outbox.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-orders-hardening.rollback.sql"

psql "$(database_url "$upgrade_db")" -v ON_ERROR_STOP=1 -c "do \$\$ begin if not has_function_privilege('service_role','public.transition_order_atomic(uuid,text,text,text,text,text,text,text)','EXECUTE') then raise exception 'rollback não restaurou state machine da PR #38'; end if; end \$\$;"

apply_file "$upgrade_db" "docs/supabase-orders-hardening.sql"
apply_file "$upgrade_db" "docs/supabase-transactional-email-outbox.sql"
apply_file "$upgrade_db" "docs/supabase-retention-controls.sql"
apply_file "$upgrade_db" "docs/supabase-email-outbox-fencing.sql"

apply_file "$upgrade_db" "tests/database/transactions.sql"
apply_file "$upgrade_db" "tests/database/orders.sql"
apply_file "$upgrade_db" "tests/database/order-pr38-invariants.sql"
apply_file "$upgrade_db" "tests/database/email-outbox.sql"
apply_file "$upgrade_db" "tests/database/retention.sql"
# Rollback do procurement financeiro e reaplicação, no banco de upgrade.
apply_file "$upgrade_db" "docs/supabase-financial-procurement.sql"
apply_file "$upgrade_db" "docs/supabase-financial-procurement-hardening.sql"
apply_file "$upgrade_db" "docs/supabase-financial-pilot.sql"
apply_file "$upgrade_db" "docs/supabase-financial-enterprise-approvals.sql"
apply_file "$upgrade_db" "docs/supabase-financial-enterprise-drafts.sql"
apply_file "$upgrade_db" "docs/supabase-financial-collaboration.sql"
apply_file "$upgrade_db" "docs/supabase-financial-operational-search.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-operational-search.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-collaboration.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-enterprise-drafts.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-enterprise-approvals.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-procurement.rollback.sql"
psql "$(database_url "$upgrade_db")" -v ON_ERROR_STOP=1 -c "do \$\$ begin if to_regclass('public.fin_rfqs') is not null then raise exception 'rollback financeiro não removeu as tabelas'; end if; end \$\$;"
apply_file "$upgrade_db" "docs/supabase-financial-procurement.sql"
apply_file "$upgrade_db" "docs/supabase-financial-procurement-hardening.sql"
apply_file "$upgrade_db" "docs/supabase-financial-pilot.sql"
apply_file "$upgrade_db" "docs/supabase-financial-enterprise-approvals.sql"
apply_file "$upgrade_db" "docs/supabase-financial-enterprise-drafts.sql"
apply_file "$upgrade_db" "docs/supabase-financial-collaboration.sql"
apply_file "$upgrade_db" "docs/supabase-financial-operational-search.sql"
apply_file "$upgrade_db" "tests/database/financial-procurement.sql"
apply_file "$upgrade_db" "tests/database/financial-procurement-hardening.sql"
apply_file "$upgrade_db" "tests/database/financial-pilot.sql"
apply_file "$upgrade_db" "tests/database/financial-enterprise-approvals.sql"
apply_file "$upgrade_db" "tests/database/financial-enterprise-drafts.sql"
apply_file "$upgrade_db" "tests/database/financial-collaboration.sql"
apply_file "$upgrade_db" "tests/database/financial-operational-search.sql"
bash "$root_dir/tests/database/email-outbox-concurrency.sh" "$(database_url "$upgrade_db")"

echo "Arandu Database Integration Tests"
echo "Instalação limpa, upgrade, reaplicação, rollback, RLS, transações, pedidos, invariantes PR38, outbox, fencing de workers, retenção e procurement financeiro aprovados."

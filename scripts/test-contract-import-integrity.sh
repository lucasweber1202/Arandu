#!/usr/bin/env bash
# Standalone gate for the contract import intent layer. The canonical manifest
# already installs it (after external decisions); this rehearses pre-use
# rollback, double reapply, the SQL contract and real concurrency on one DB.
# The common runner (scripts/test-database.sh) covers clean/upgrade/fresh.
set -euo pipefail
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"
base_url="${ARANDU_CONTRACT_INTEGRITY_TEST_URL:?Disposable loopback database URL required}"
node --input-type=module -e 'const u=new URL(process.argv[1]);if(!["localhost","127.0.0.1","[::1]"].includes(u.hostname))throw Error("loopback only")' "$base_url"
psql "$base_url" -v ON_ERROR_STOP=1 -f tests/database/bootstrap.sql
while IFS= read -r file; do psql "$base_url" -v ON_ERROR_STOP=1 -f "$file"; done < <(node -e 'for(const f of require("./docs/supabase-migrations.json").cleanInstall)console.log(f)')
psql "$base_url" -v ON_ERROR_STOP=1 -f docs/rollback/supabase-financial-contract-import-integrity.rollback.sql
psql "$base_url" -v ON_ERROR_STOP=1 -f docs/supabase-financial-contract-import-integrity.sql
psql "$base_url" -v ON_ERROR_STOP=1 -f docs/supabase-financial-contract-import-integrity.sql
psql "$base_url" -v ON_ERROR_STOP=1 -f tests/database/financial-contract-import-integrity.sql
node tests/database/contract-import-integrity-concurrency.mjs "$base_url"

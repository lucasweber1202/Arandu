#!/usr/bin/env bash
set -euo pipefail
state=scripts/pilot-local/.state
out=reports/passport-diagnostic
set -a
. "$state/.env"
. "$state/demo.env"
set +a
export ARANDU_DEMO_APP_URL=https://localhost:4443 NODE_EXTRA_CA_CERTS="$state/cert.pem" PASSPORT_NETWORK_DIAGNOSTICS=1
mkdir -p "$out"
cp lib/api/domains/finance.mjs /tmp/arandu-diagnostic-candidate-finance.mjs
trap 'cp /tmp/arandu-diagnostic-candidate-finance.mjs lib/api/domains/finance.mjs' EXIT
result=0
# Both backends use identical frontend bytes, database, sessions and guard policy.
# Main's finance.mjs is self-contained for tasks/documents; extracted modules
# are not imported by that variant. No schema/config or rule is changed.
for variant in candidate main; do
  if [ "$variant" = main ]; then
    git show c72e6868940b2685b45f0f2728edab1763301679:lib/api/domains/finance.mjs > lib/api/domains/finance.mjs
  fi
  bash scripts/demo/local.sh app
  export PLAYWRIGHT_HTML_OUTPUT_DIR="$out/$variant-warmup"
  set +e
  npx playwright test --config playwright.demo.config.js tests/e2e/demo-baseline.spec.js --project demo-desktop --grep 'tesouraria:|CFO:|provedor:|Financial Passport:' --workers 1 --trace off --reporter=list,html 2>&1 | tee "$out/$variant-warmup.txt"
  status=${PIPESTATUS[0]}
  set -e
  if [ "$status" -ne 0 ]; then result=1; fi
  export PLAYWRIGHT_HTML_OUTPUT_DIR="$out/$variant-repeats"
  set +e
  npx playwright test --config playwright.demo.config.js tests/e2e/demo-baseline.spec.js --project demo-desktop --grep 'Financial Passport:' --repeat-each 3 --workers 1 --trace off --reporter=list,html 2>&1 | tee "$out/$variant-repeats.txt"
  status=${PIPESTATUS[0]}
  set -e
  if [ "$status" -ne 0 ]; then result=1; fi
 done
exit "$result"

#!/usr/bin/env bash
set -euo pipefail
umask 077
state=scripts/pilot-local/.state
out=reports/passport-diagnostic
set -a
. "$state/.env"
. "$state/demo.env"
set +a
export ARANDU_DEMO_APP_URL=https://localhost:4443 NODE_EXTRA_CA_CERTS="$state/cert.pem"
unset PASSPORT_NETWORK_DIAGNOSTICS
mkdir -p "$out"
result=0
for mode in default pinned; do
  export PASSPORT_TLS_MODE="$mode"
  for batch in 1 2 3; do
    bash scripts/demo/local.sh app
    export PLAYWRIGHT_HTML_OUTPUT_DIR="$out/$mode-$batch"
    export PASSPORT_NETLOG_FILE="/tmp/arandu-passport-$mode-$batch.netlog.json"
    set +e
    npx playwright test --config playwright.demo.config.js tests/e2e/demo-baseline.spec.js --project demo-desktop --grep 'tesouraria:|CFO:|provedor:|Financial Passport:' --workers 1 --trace off --reporter=list,html 2>&1 | tee "$out/$mode-$batch.txt"
    statuses=("${PIPESTATUS[@]}")
    set -e
    if [ "${statuses[0]}" -ne 0 ] || [ "${statuses[1]}" -ne 0 ]; then result=1; fi
    if [ -f "$PASSPORT_NETLOG_FILE" ]; then node scripts/ci-demo/filter-passport-netlog.mjs "$PASSPORT_NETLOG_FILE" "$out/$mode-$batch-transport.json"; fi
  done
 done
exit "$result"

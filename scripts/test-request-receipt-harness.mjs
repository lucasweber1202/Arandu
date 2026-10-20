import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const dir = mkdtempSync(join(tmpdir(), 'arandu-receipt-harness-'));
try {
  for (const url of ['postgresql://fixture.invalid/not-authorized', 'postgresql://127.0.0.1/disposable?host=fixture.invalid']) {
    const hosted = spawnSync('bash', [resolve('tests/database/request-receipt-concurrency.sh'), url], { encoding: 'utf8' });
    assert.notEqual(hosted.status, 0); assert.match(hosted.stderr, /loopback/);
  }
  writeFileSync(join(dir, 'psql'), `#!/usr/bin/env bash
set -eu
query=''
while [ "$#" -gt 0 ]; do if [ "$1" = '-c' ]; then shift; query="$1"; fi; shift; done
if [[ "$query" == *'begin;'* ]]; then
  exec 9>"$HARNESS_DIR/lock"
  flock 9
  n=0; if [ -f "$HARNESS_DIR/count" ]; then read -r n < "$HARNESS_DIR/count"; fi
  n=$((n+1)); echo "$n" > "$HARNESS_DIR/count"
  if [ "$n" = 1 ]; then exit 0; fi
  if [ "$HARNESS_MODE" = unexpected ]; then echo 'ERROR:  08006: connection lost' >&2
  else echo 'ERROR:  P0001: duplicate request' >&2; fi
  exit 1
elif [[ "$query" == *'fin_request_receipts'* ]]; then
  if [ "$HARNESS_MODE" = receipt-missing ]; then echo '1|0|0'; else echo '1|1|1'; fi
elif [[ "$query" == *'count(*)'* ]]; then echo 1
else cat >/dev/null
fi
`, { mode: 0o755 });
  for (const mode of ['duplicates', 'unexpected', 'receipt-missing']) {
    rmSync(join(dir, 'count'), { force: true });
    const r = spawnSync('bash', [resolve('tests/database/request-receipt-concurrency.sh'), 'postgresql://127.0.0.1/disposable'], {
      encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, HARNESS_DIR: dir, HARNESS_MODE: mode }
    });
    if (mode === 'duplicates') assert.equal(r.status, 0, r.stderr);
    else assert.notEqual(r.status, 0, `${mode}: concurrency harness masked failure`);
  }
  console.log('Request receipt harness: expected duplicate errors accepted; connection loss and missing receipt fail closed (mock psql, not DB proof).');
} finally { rmSync(dir, { recursive: true, force: true }); }

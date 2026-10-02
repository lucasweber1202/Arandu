import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const command = (args) => spawnSync(process.execPath, ['scripts/build-supabase-migration-bundle.mjs', '--stdout', ...args], { encoding: 'utf8' });
const pending = command(['--flow=existingDatabase', '--after-schema=financial-surface-hardening-1']);
assert.equal(pending.status, 0, pending.stderr);
const approval = readFileSync('docs/supabase-financial-approval-handoff.sql', 'utf8').trim();
const passport = readFileSync('docs/supabase-financial-passport.sql', 'utf8').trim();
assert(pending.stdout.includes(approval));
assert(pending.stdout.includes(passport));
assert(pending.stdout.indexOf(approval) < pending.stdout.indexOf(passport));
assert(!pending.stdout.includes('docs/supabase-financial-pilot-surface-hardening.sql'));
assert.equal(pending.stdout, command(['--flow=existingDatabase', '--after-schema=financial-surface-hardening-1']).stdout);
const current = command(['--flow=existingDatabase', '--after-schema=financial-passport-1']);
assert.equal(current.status, 0, current.stderr);
assert(current.stdout.includes('0 migration(s) pendente(s)'));
assert(!/create or replace|alter table|insert into/i.test(current.stdout));
for (const args of [
  ['--flow=existingDatabase', '--after-schema=unknown'],
  ['--flow=existingDatabase', '--after-schema='],
  ['--flow=cleanInstall', '--after-schema=financial-surface-hardening-1']
]) {
  const result = command(args);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '', 'Invalid target must not emit applicable SQL');
}
console.log('Pending migration bundles: order, contents, deterministic output, current schema and fail-closed targets passed.');

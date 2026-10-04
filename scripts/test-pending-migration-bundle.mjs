import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const command = (args) => spawnSync(process.execPath, ['scripts/build-supabase-migration-bundle.mjs', '--stdout', ...args], { encoding: 'utf8' });
const pending = command(['--flow=existingDatabase', '--after-schema=financial-surface-hardening-1']);
assert.equal(pending.status, 0, pending.stderr);
const approval = readFileSync('docs/supabase-financial-approval-handoff.sql', 'utf8').trim();
const passport = readFileSync('docs/supabase-financial-passport.sql', 'utf8').trim();
const multiEntity = readFileSync('docs/supabase-financial-multi-entity.sql', 'utf8').trim();
const contractsV2 = readFileSync('docs/supabase-financial-contracts-v2.sql', 'utf8').trim();
const portfolio = readFileSync('docs/supabase-financial-relationships-portfolio.sql', 'utf8').trim();
assert(pending.stdout.includes(approval));
assert(pending.stdout.includes(passport));
assert(pending.stdout.includes(multiEntity));
assert(pending.stdout.indexOf(approval) < pending.stdout.indexOf(passport));
assert(pending.stdout.indexOf(passport) < pending.stdout.indexOf(multiEntity));
const afterPassport = command(['--flow=existingDatabase', '--after-schema=financial-passport-1']);
assert.equal(afterPassport.status, 0, afterPassport.stderr);
assert(afterPassport.stdout.includes('14 migration(s) pendente(s)'));
assert(afterPassport.stdout.indexOf(contractsV2) < afterPassport.stdout.indexOf(portfolio));
assert(afterPassport.stdout.indexOf(multiEntity) < afterPassport.stdout.indexOf(contractsV2));
assert(afterPassport.stdout.includes(multiEntity));
assert(!afterPassport.stdout.includes(passport));
assert(!pending.stdout.includes('docs/supabase-financial-pilot-surface-hardening.sql'));
assert.equal(pending.stdout, command(['--flow=existingDatabase', '--after-schema=financial-surface-hardening-1']).stdout);
assert(afterPassport.stdout.includes(readFileSync('docs/supabase-financial-operational-resilience.sql','utf8').trim()));
const afterSso=command(['--flow=existingDatabase','--after-schema=financial-sso-1']);
assert.equal(afterSso.status,0,afterSso.stderr);
assert(afterSso.stdout.includes('6 migration(s) pendente(s)'));
assert(afterSso.stdout.includes(readFileSync('docs/supabase-financial-operational-resilience.sql','utf8').trim()));
const afterResilience = command(['--flow=existingDatabase', '--after-schema=financial-operational-resilience-1']);
assert.equal(afterResilience.status, 0, afterResilience.stderr);
assert(afterResilience.stdout.includes('5 migration(s) pendente(s)'));
assert(afterResilience.stdout.includes(readFileSync('docs/supabase-financial-data-governance.sql','utf8').trim()));
const afterGovernance = command(['--flow=existingDatabase', '--after-schema=financial-data-governance-1']);
assert.equal(afterGovernance.status, 0, afterGovernance.stderr);
assert(afterGovernance.stdout.includes('4 migration(s) pendente(s)'));
assert(afterGovernance.stdout.includes(readFileSync('docs/supabase-financial-legacy-art-decommission.sql','utf8').trim()));
const afterDecommission = command(['--flow=existingDatabase', '--after-schema=financial-legacy-art-decommission-1']);
assert.equal(afterDecommission.status, 0, afterDecommission.stderr);
assert(afterDecommission.stdout.includes('3 migration(s) pendente(s)'));
assert(afterDecommission.stdout.includes(readFileSync('docs/supabase-financial-p0-closure.sql','utf8').trim()));
const afterClosure = command(['--flow=existingDatabase', '--after-schema=financial-p0-closure-1']);
assert.equal(afterClosure.status, 0, afterClosure.stderr);
assert(afterClosure.stdout.includes('2 migration(s) pendente(s)'));
assert(afterClosure.stdout.includes(readFileSync('docs/supabase-financial-value-realization.sql','utf8').trim()));
const afterValue = command(['--flow=existingDatabase', '--after-schema=financial-value-realization-1']);
assert.equal(afterValue.status, 0, afterValue.stderr);
assert(afterValue.stdout.includes('1 migration(s) pendente(s)'));
assert(afterValue.stdout.includes(readFileSync('docs/supabase-financial-fee-intelligence.sql','utf8').trim()));
const current = command(['--flow=existingDatabase', '--after-schema=financial-fee-intelligence-1']);
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

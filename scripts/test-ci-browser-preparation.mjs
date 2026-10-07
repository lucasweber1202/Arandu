import assert from 'node:assert/strict';
import fs from 'node:fs';
import { useUbuntuArchive, networkConfig } from './configure-ci-apt.mjs';

const deb822 = 'Types: deb\nURIs: http://azure.archive.ubuntu.com/ubuntu/\nSuites: noble noble-updates noble-security\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n';
assert.equal(useUbuntuArchive(deb822), deb822.replace('http://azure.archive.ubuntu.com', 'https://archive.ubuntu.com'));
const legacy = 'deb https://azure.archive.ubuntu.com/ubuntu noble main\n';
assert.equal(useUbuntuArchive(legacy), 'deb https://archive.ubuntu.com/ubuntu noble main\n');
assert.equal(useUbuntuArchive('https://azure.archive.ubuntu.com/ubuntu-evil'), 'https://azure.archive.ubuntu.com/ubuntu-evil');
assert.equal(useUbuntuArchive(deb822.replace('azure.archive.ubuntu.com', 'packages.microsoft.com')), deb822.replace('azure.archive.ubuntu.com', 'packages.microsoft.com'));
assert.equal(useUbuntuArchive(useUbuntuArchive(deb822)), useUbuntuArchive(deb822));
assert.match(networkConfig, /APT::Update::Error-Mode "any"/);
const workflow = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
for (const job of ['validate', 'presentation']) {
  const section = workflow.split(new RegExp(`^  ${job}:`, 'm'))[1].split(/^  [a-z][\w-]*:/m)[0];
  const steps = section.split(/      - name:/).slice(1);
  const verify = steps.findIndex((step) => step.includes('node scripts/verify-ci-browsers.mjs'));
  assert.ok(verify >= 0, `${job} must probe all engines`);
  assert.doesNotMatch(steps[verify], /\n\s+if:|continue-on-error:/, `${job} browser verification is mandatory`);
  for (const [index, step] of steps.entries()) {
    if (!/run: npm run test:e2e(?::finance|:presentation)/.test(step)) continue;
    assert.ok(index > verify, `${job} suite must follow verification`);
    assert.doesNotMatch(step, /if:.*!cancelled\(\)|continue-on-error:/, `${job} suite must fail closed after preparation failure`);
  }
}
console.log('CI browser preparation: signed source preservation, transport scope, idempotence and suite fail-fast PASS.');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { useUbuntuArchive, networkConfig } from './configure-ci-apt.mjs';

const deb822 = 'Types: deb\nURIs: http://azure.archive.ubuntu.com/ubuntu/\nSuites: noble noble-updates noble-security\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n';
assert.equal(useUbuntuArchive(deb822), deb822.replace('http://azure.archive.ubuntu.com', 'https://archive.ubuntu.com'));
const runnerSource = deb822.replace('http://azure.archive.ubuntu.com/ubuntu/', 'mirror+file:/etc/apt/apt-mirrors.txt');
assert.equal(useUbuntuArchive(runnerSource), deb822.replace('http://azure.archive.ubuntu.com', 'https://archive.ubuntu.com').replace('/ubuntu/', '/ubuntu'));
assert.equal(useUbuntuArchive('mirror+file:/etc/apt/other-mirrors.txt'), 'mirror+file:/etc/apt/other-mirrors.txt');
const legacy = 'deb https://azure.archive.ubuntu.com/ubuntu noble main\n';
assert.equal(useUbuntuArchive(legacy), 'deb https://archive.ubuntu.com/ubuntu noble main\n');
assert.equal(useUbuntuArchive('https://azure.archive.ubuntu.com/ubuntu-evil'), 'https://azure.archive.ubuntu.com/ubuntu-evil');
assert.equal(useUbuntuArchive(deb822.replace('azure.archive.ubuntu.com', 'packages.microsoft.com')), deb822.replace('azure.archive.ubuntu.com', 'packages.microsoft.com'));
assert.equal(useUbuntuArchive(useUbuntuArchive(deb822)), useUbuntuArchive(deb822));
assert.match(networkConfig, /APT::Update::Error-Mode "any"/);
const workflow = fs.readFileSync('.github/workflows/ci-full.yml', 'utf8');
const browserWorkflow=fs.readFileSync('.github/workflows/ci-browser.yml','utf8');
for (const [job,section] of [['browser',browserWorkflow],['presentation',workflow.split(/^  presentation:/m)[1].split(/^  [a-z][\w-]*:/m)[0]]]) {
  const steps=section.split(/      - name:/).slice(1);
  const verify=steps.findIndex(step=>step.includes('node scripts/verify-ci-browsers.mjs'));
  assert.ok(verify>=0,`${job} must probe all engines`);
  assert.doesNotMatch(steps[verify],/\n\s+if:|continue-on-error:/,`${job} browser verification is mandatory`);
  const tests=steps.findIndex(step=>/run: (?:npm run test:e2e:presentation|node scripts\/run-ci-browser-group\.mjs)/.test(step));
  assert.ok(tests>verify,`${job} suite must follow verification`);
  assert.doesNotMatch(steps[tests],/if:.*!cancelled\(\)|continue-on-error:/,`${job} suite fails closed`);
}
for(const job of ['validate','validate-mobile','validate-webkit','validate-safari']) {
 const section=workflow.split(new RegExp(`^  ${job}:`,'m'))[1].split(/^  [a-z][\w-]*:/m)[0];
 assert.match(section,/needs: validate-source/);assert.match(section,/uses: \.\/\.github\/workflows\/ci-browser\.yml/);
}
assert.match(workflow,/needs: \[validate-source, validate, validate-mobile, validate-webkit, validate-safari\]/);
assert.match(workflow,/node scripts\/ci-browser-coverage\.mjs --job-outputs/);
assert.match(workflow,/Cheap explicit Demo build and unchanged budgets before browsers/);
assert.doesNotMatch(workflow.split(/^  browser-coverage:/m)[1].split(/^  presentation:/m)[0],/continue-on-error:/);
console.log('CI browser preparation: signed source preservation, transport scope, idempotence and suite fail-fast PASS.');

assert.match(browserWorkflow,/browserEngines/);
assert.match(browserWorkflow,/install-deps \$BROWSER_ENGINES/);
assert.match(browserWorkflow,/run: npx playwright install \$BROWSER_ENGINES/);
assert.match(browserWorkflow,/hashFiles\('package-lock.json'\) }}-\$\{\{ inputs.browser_group }}/);

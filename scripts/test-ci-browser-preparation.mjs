import assert from 'node:assert/strict';
import fs from 'node:fs';
import { useMirrorList, mirrorList, networkConfig, ARANDU_MIRROR_FILE } from './configure-ci-apt.mjs';
import { classifyAptFailure, failingHosts, FAILURE_CLASSES } from './ci/apt-install.mjs';

const list = `mirror+file:${ARANDU_MIRROR_FILE}`;
const deb822 = 'Types: deb\nURIs: http://azure.archive.ubuntu.com/ubuntu/\nSuites: noble noble-updates noble-security\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n';
// Suites, components and Signed-By survive; only the transport becomes the mirror list.
assert.equal(useMirrorList(deb822), deb822.replace('http://azure.archive.ubuntu.com/ubuntu/', list));
const runnerSource = deb822.replace('http://azure.archive.ubuntu.com/ubuntu/', 'mirror+file:/etc/apt/apt-mirrors.txt');
assert.equal(useMirrorList(runnerSource), useMirrorList(deb822));
assert.equal(useMirrorList('deb http://security.ubuntu.com/ubuntu noble-security main\n'), `deb ${list} noble-security main\n`);
assert.equal(useMirrorList('mirror+file:/etc/apt/other-mirrors.txt'), 'mirror+file:/etc/apt/other-mirrors.txt');
assert.equal(useMirrorList('https://azure.archive.ubuntu.com/ubuntu-evil'), 'https://azure.archive.ubuntu.com/ubuntu-evil');
assert.equal(useMirrorList(deb822.replace('azure.archive.ubuntu.com', 'packages.microsoft.com')), deb822.replace('azure.archive.ubuntu.com', 'packages.microsoft.com'));
assert.equal(useMirrorList(useMirrorList(deb822)), useMirrorList(deb822));
// Run 44524490289 (AWS us-east-1): the runner's own mirrors stay first; official hosts are only fallbacks.
const aws = 'http://us-east-1.ec2.archive.ubuntu.com/ubuntu/\tpriority:1\nhttps://archive.ubuntu.com/ubuntu/\tpriority:2\n# comment\nfile:///evil\n';
assert.deepEqual(mirrorList(aws).trim().split('\n'), ['http://us-east-1.ec2.archive.ubuntu.com/ubuntu/\tpriority:1', 'https://archive.ubuntu.com/ubuntu/\tpriority:2', 'http://security.ubuntu.com/ubuntu/']);
assert.deepEqual(mirrorList('').trim().split('\n'), ['https://archive.ubuntu.com/ubuntu/', 'http://security.ubuntu.com/ubuntu/']);
assert.equal(mirrorList(mirrorList(aws)), mirrorList(aws));
assert.match(networkConfig, /APT::Update::Error-Mode "any"/);
assert.match(networkConfig, /Acquire::ForceIPv4 "true"/);
assert.doesNotMatch(networkConfig, /AllowInsecure|AllowUnauthenticated|trusted/i);
// Classified apt failures, using the literal lines from run 44524490289.
const realLog = `Err:6 http://security.ubuntu.com/ubuntu noble-security InRelease
  Cannot initiate the connection to security.ubuntu.com:80 (2620:2d:4002:1::103). - connect (101: Network is unreachable)
E: Failed to fetch https://archive.ubuntu.com/ubuntu/dists/noble/InRelease  Could not wait for server fd - select (11: Resource temporarily unavailable) [IP: 91.189.91.83 443]
E: Some index files failed to download. They have been ignored, or old ones used instead.`;
assert.equal(classifyAptFailure(realLog), 'external_dependency');
assert.deepEqual(failingHosts(realLog).sort(), ['archive.ubuntu.com', 'security.ubuntu.com']);
assert.equal(classifyAptFailure('W: GPG error: ... NO_PUBKEY ABC\nE: Failed to fetch x'), 'security');
assert.equal(classifyAptFailure('E: Unable to locate package agee'), 'installation');
assert.equal(classifyAptFailure('E: Could not get lock /var/lib/dpkg/lock-frontend'), 'capacity');
assert.deepEqual(Object.values(FAILURE_CLASSES), [20, 21, 22, 23]);
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
for(const job of ['validate','validate-webkit','validate-safari']) {
 const section=workflow.split(new RegExp(`^  ${job}:`,'m'))[1].split(/^  [a-z][\w-]*:/m)[0];
 assert.match(section,/needs: validate-source/);assert.match(section,/uses: \.\/\.github\/workflows\/ci-browser\.yml/);
}
assert.match(workflow,/needs: \[validate-source, validate, validate-webkit, validate-safari\]/);
assert.match(workflow,/node scripts\/ci-browser-coverage\.mjs --job-outputs/);
assert.match(workflow,/Cheap explicit Demo build and unchanged budgets before browsers/);
assert.doesNotMatch(workflow.split(/^  browser-coverage:/m)[1].split(/^  presentation:/m)[0],/continue-on-error:/);


assert.match(browserWorkflow,/browserEngines/);
assert.match(browserWorkflow,/install-deps \$BROWSER_ENGINES/);
assert.match(browserWorkflow,/run: npx playwright install \$BROWSER_ENGINES/);
assert.match(browserWorkflow,/hashFiles\('package-lock.json'\) }}-\$\{\{ inputs.browser_group }}/);

for (const file of fs.readdirSync('.github/workflows')) {
  const text = fs.readFileSync(`.github/workflows/${file}`, 'utf8');
  assert.doesNotMatch(text, /apt-get update &&/, `${file}: an unclassified apt-get update masked by && is forbidden`);
  assert.doesNotMatch(text, /apt-get install[^\n]*\bage\b/, `${file}: age comes from the pinned release, not apt`);
}
assert.match(browserWorkflow, /apt-install\.mjs --update-only\n\s+npx playwright install-deps/);
console.log('CI browser preparation: runner mirror first, official fallback, signed sources, classified apt, idempotence and suite fail-fast PASS.');

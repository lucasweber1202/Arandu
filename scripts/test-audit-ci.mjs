import assert from 'node:assert/strict';
import { classifyNpmAudit, verifyOfficialWithdrawal, GHSA_URL, GHSA_CVE } from '../lib/npm-audit-gate.mjs';

const root = {
  name: 'picomatch', severity: 'high',
  via: [{ name: 'picomatch', url: GHSA_URL, severity: 'high' }]
};
const report = (vulnerabilities) => ({
  auditReportVersion: 2,
  vulnerabilities,
  metadata: { vulnerabilities: {
    high: Object.values(vulnerabilities).filter(v => v.severity === 'high').length,
    critical: Object.values(vulnerabilities).filter(v => v.severity === 'critical').length
  } }
});
const chain = {
  picomatch: root,
  fdir: { severity: 'high', via: ['picomatch'] },
  tinyglobby: { severity: 'high', via: ['picomatch', 'fdir'] },
  vite: { severity: 'high', via: ['picomatch', 'tinyglobby'] }
};
assert.deepEqual(classifyNpmAudit(report({})), { kind: 'clean', names: [] });
assert.equal(classifyNpmAudit(report(chain)).kind, 'withdrawn-candidate');

const high = { severity: 'high', via: [{ name: 'other', url: 'https://github.com/advisories/GHSA-other', severity: 'high' }] };
const mutated = (obj) => structuredClone(obj);
for (const vulnerabilities of [
  { ...chain, other: high },
  { ...chain, picomatch: { ...root, via: [...root.via, high.via[0]] } },
  { ...chain, fdir: { severity: 'high', via: ['not-installed'] } },
  { ...chain, picomatch: { severity: 'high', via: ['fdir'] } },
  { ...chain, picomatch: { ...root, via: [] } },
  { ...chain, picomatch: { ...root, via: [{ ...root.via[0], url: 'https://fake.example/ghsa' }] } }
]) assert.equal(classifyNpmAudit(report(vulnerabilities)).kind, 'blocked');
assert.equal(classifyNpmAudit({ error: { code: 'ENOAUDIT' } }).kind, 'blocked');
const forged = report(chain); forged.metadata.vulnerabilities.high = 0;
assert.equal(classifyNpmAudit(forged).kind, 'blocked');

const now = Date.parse('2026-11-18T18:00:00Z');
const official = {
  id: 'GHSA-fc5q-39xc-vjpf', aliases: [GHSA_CVE],
  withdrawn: '2026-11-18T15:38:56Z', modified: '2026-11-18T15:38:56Z',
  affected: [{ package: { name: 'picomatch', ecosystem: 'npm' } }],
  database_specific: { github_reviewed: true }
};
assert.equal(verifyOfficialWithdrawal(official, now), true);
for (const value of [
  { ...official, withdrawn: null },
  { ...official, withdrawn: '2026-11-19T15:38:56Z' },
  { ...official, modified: '2026-11-17T15:38:56Z' },
  { ...official, id: 'GHSA-other' },
  { ...official, aliases: [] },
  { ...official, affected: [{ package: { name: 'unrelated', ecosystem: 'npm' } }] },
  { ...official, database_specific: { github_reviewed: false } }
]) assert.equal(verifyOfficialWithdrawal(value, now), false);
assert.equal(verifyOfficialWithdrawal(official, Date.parse('2026-12-18T00:00:00Z')), false);
console.log('Audit: aviso retirado exige fonte oficial, prazo e identificação exatos; outros high/critical e erros são recusados.');

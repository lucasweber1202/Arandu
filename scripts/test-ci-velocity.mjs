import {execFileSync} from 'node:child_process';
import {seedQuotaReport} from './ci/seed-quota-report.mjs';
import {browserBalance} from './ci/browser-balance.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parseChanges} from './ci/changes.mjs';
import {reportAttempt,riskReceipt,browserCounts,demoPreparations} from './ci/velocity-report.mjs';
import {BROWSER_GROUPS,browserProjects,browserEngines} from './ci-browser-groups.mjs';
import {classifyChanges} from './ci/risk-policy.mjs';
assert.deepEqual(parseChanges('R100\0old name\0new\nname\0M\0next\0'),[{status:'renamed',previous_filename:'old name',filename:'new\nname'},{status:'modified',filename:'next'}]);
assert.deepEqual(parseChanges('C100\0old\0new\0'),[{status:'added',filename:'new'}]);
assert.throws(()=>parseChanges('X\0file\0'));
const projects=Object.values(BROWSER_GROUPS).flat();
assert.equal(projects.length,5);assert.equal(new Set(projects).size,5);
assert.throws(()=>browserProjects('all'));
for(const filename of ['docs/CONTRACT_PORTFOLIO_SCALE.md','docs/evidence/release-assurance-2026-10-25.md','docs/evidence/new-report.md','docs/help/auth.md','lib/api/domains/auth.mjs','docs/CI_VELOCITY_V9.md']) {
 assert.equal(classifyChanges([{status:'modified',filename}]).risk,'D',filename);
}
const run={id:1,head_sha:'a'.repeat(40),created_at:'2026-01-01T00:00:00Z',run_started_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-02T00:00:00Z'};
const job=(name,created,start,end)=>({name,created_at:`2026-01-01T00:00:${created}Z`,started_at:`2026-01-01T00:00:${start}Z`,completed_at:`2026-01-01T00:00:${end}Z`,conclusion:'success',steps:[]});
const jobs=[job('classify','00','02','05'),job('full / validate-source','05','07','15'),job('full / validate / browser','15','17','30'),job('full / browser-coverage','30','31','32'),job('validate','32','33','34')];
const report=reportAttempt(run,jobs);
assert.equal(report.attempt_wall_seconds,34,'rerun update must not inflate attempt duration');
assert.equal(report.critical_path.seconds,34);
assert.equal(report.jobs[2].queue_seconds,2);
assert.equal(report.jobs[2].pre_queue_dependency_and_dispatch_seconds,15);
assert.equal(reportAttempt(run,[job('unknown','00','01','02')]).critical_path,null);
assert.equal(reportAttempt(run,[{...jobs[0],created_at:null}]).critical_path,null);
assert(!JSON.stringify(reportAttempt({...run,secret:'DO_NOT_SERIALIZE'},jobs)).includes('DO_NOT_SERIALIZE'));
console.log('CI Velocity: shared diff parser, five projects once, sensitive/unknown docs D, DAG/queue/attempt accounting and metadata allowlist PASS');

assert.equal(riskReceipt('not a receipt'),null);
assert.equal(riskReceipt('ARANDU_RISK_RECEIPT '+JSON.stringify({sha:'a'.repeat(40),risk:'D',reasons:[],private:'DO_NOT_SERIALIZE'})).private,undefined);

assert.deepEqual(browserEngines('chromium_firefox'),['chromium','firefox']);
assert.throws(()=>browserEngines('firefox'));
assert.deepEqual(browserEngines('webkit'),['webkit']);
assert.deepEqual(browserEngines('safari'),['webkit']);
assert.throws(()=>browserEngines('typo'));

const reused={...job('full / validate-source','40','07','15')};
const partial=reportAttempt(run,[reused,job('full / presentation','40','41','50')]);
assert.equal(partial.inherited_jobs.length,1);
assert.equal(partial.runner_minutes_estimate,1,'copied old jobs must not be billed on a rerun');
assert.equal(partial.critical_path,null,'partial rerun cannot reconstruct full critical path');

const counts={sha:'a'.repeat(40),group:'chromium',result:'passed',planned:3,executed:3,attempts:4,retries:1,flaky:1,skipped:1,passed:2,secret:'DO_NOT_SERIALIZE'};
assert.equal(browserCounts('ARANDU_BROWSER_COUNTS '+JSON.stringify(counts))[0].secret,undefined);
assert.equal(browserCounts('ARANDU_BROWSER_COUNTS '+JSON.stringify({...counts,attempts:-1})).length,0);

const quota=seedQuotaReport({requests:[{channel:'app',method:'POST',resource:'spend/reconcile',actor:'buyer.finance_manager',attempts:83,statuses:{'200':82,'429':1}}]});
assert.equal(quota.actors[0].non_429_attempts,82);
assert.equal(quota.actors[0].minimum_span_seconds_if_one_identity,600);
assert.throws(()=>seedQuotaReport({requests:[{channel:'app',method:'POST',resource:'bad?secret',actor:'buyer',attempts:1}]}));
const balance=browserBalance(JSON.parse(fs.readFileSync('ops/ci/acceleration-v7/browser-baseline-41898780191.json','utf8')));
assert.equal(new Set(balance.designs.map(d=>d.total_worker_ms)).size,1,'partition must preserve measured work');
assert(balance.designs[2].max_worker_ms<balance.designs[0].max_worker_ms);

for(const filename of ['docs/evidence/claude-ux-ui-audit-2026-10-18/rfqs-desktop-before.png','docs/evidence/browser-check/mobile.webp'])assert.equal(classifyChanges([{status:'modified',filename}]).risk,'A',filename);
for(const filename of ['docs/evidence/auth.png','docs/evidence/contract.svg','docs/evidence/result.json','docs/evidence/notes.md','docs/evidence/frame.png.js','docs/evidence/migration/frame.png','docs/evidence/../frame.png']) {
 if(filename.includes('../'))assert.throws(()=>classifyChanges([{status:'modified',filename}]));
 else assert.equal(classifyChanges([{status:'modified',filename}]).risk,'D',filename);
}
assert.equal(classifyChanges([{status:'renamed',filename:'docs/evidence/frame.png',previous_filename:'docs/RISK_BASED_CI.md'}]).risk,'D');

// Parse the real entrypoint without executing it or provisioning a stack.
execFileSync(process.execPath,['--check','scripts/demo/seed.mjs'],{stdio:'pipe'});

assert.deepEqual(browserEngines('presentation'),['chromium','firefox','webkit']);
assert.throws(()=>browserProjects('presentation'),'presentation must never become a product coverage group');

const preparation={sha:'a'.repeat(40),result:'PASS',wall_ms:600001,overlap_ms:30000,phases:[{name:'seed',result:'success',wall_ms:600000},{name:'browser',result:'success',wall_ms:30000}],secret:'DO_NOT_SERIALIZE'};
assert.equal(demoPreparations('ARANDU_SEED_BROWSER_PREPARATION '+JSON.stringify(preparation))[0].secret,undefined);
assert.equal(demoPreparations('ARANDU_SEED_BROWSER_PREPARATION '+JSON.stringify({...preparation,overlap_ms:NaN})).length,0);

// A B change must actually execute the modified suite in fast CI.
for(const filename of ['tests/e2e/perf-journey-weight.spec.js','tests/e2e/demo-work-os-v3.spec.js','tests/e2e/demo-persona-entry.spec.js','tests/e2e/unknown.spec.js','tests/e2e/finance-unmapped-new.spec.js'])assert.equal(classifyChanges([{status:'modified',filename}]).risk,'D',filename);
assert.equal(classifyChanges([{status:'modified',filename:'tests/e2e/finance-contract-os.spec.js'}]).risk,'B');
assert.equal(classifyChanges([{status:'modified',filename:'tests/e2e/public-tour.spec.js'}]).risk,'B');

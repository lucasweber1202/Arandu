import assert from 'node:assert/strict';
import {parseChanges} from './ci/changes.mjs';
import {reportAttempt,riskReceipt} from './ci/velocity-report.mjs';
import {BROWSER_GROUPS,browserProjects} from './ci-browser-groups.mjs';
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

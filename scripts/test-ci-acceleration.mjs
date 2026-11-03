import assert from 'node:assert/strict';
import { profileRun } from './ci-profile.mjs';
import { ciWorkers } from './ci-resource-policy.mjs';
assert.equal(ciWorkers({cpus:4,memory:16*2**30}),4);
assert.equal(ciWorkers({cpus:2,memory:7*2**30}),2);
assert.equal(ciWorkers({cpus:64,memory:7*2**30}),2);
assert.equal(ciWorkers({cpus:64,memory:128*2**30}),4);
assert.equal(ciWorkers({cpus:2,memory:2**30}),1);
assert.equal(ciWorkers({cpus:NaN,memory:Infinity}),1);
console.log('CI concurrency resource bounds PASS');

const profile=profileRun({id:1,head_sha:'fixture',created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:03:00Z'},[{name:'validate',conclusion:'success',started_at:'2026-01-01T00:01:00Z',completed_at:'2026-01-01T00:02:01Z',steps:[{name:'Build',started_at:'2026-01-01T00:01:00Z',completed_at:'2026-01-01T00:01:20Z'}]}]);
assert.equal(profile.runner_minutes_estimate,2);assert.equal(profile.jobs[0].stages.build,20);assert.equal(profile.jobs[0].dispatch_and_dependency_wait_seconds,60);
assert.equal(profileRun({},[{name:'pending'}]).runner_minutes_estimate,null);

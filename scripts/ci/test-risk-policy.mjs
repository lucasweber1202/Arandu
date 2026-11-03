import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {classifyChanges} from './risk-policy.mjs';
const classify=(filename,status='modified',previous_filename)=>classifyChanges([{filename,status,previous_filename}]).risk;
assert.equal(classify('finance/styles/main.css'),'A');
assert.equal(classify('finance/src/views/fees.js'),'B');
assert.equal(classify('lib/finance/format-presenter.mjs'),'B');
assert.equal(classify('api/example.js'),'C');
for(const p of ['docs/supabase-new.sql','lib/auth.mjs','lib/finance/storage.mjs','.github/workflows/ci.yml','scripts/ci/risk-policy.mjs','unknown'])assert.equal(classify(p),'D',p);
assert.equal(classify('finance/src/core.js','renamed','lib/auth.mjs'),'D');
assert.equal(classify('lib/auth.mjs','removed'),'D');
assert.throws(()=>classifyChanges([]));assert.throws(()=>classifyChanges([{filename:'x',status:'unknown'}]));
const base={CLASSIFY_RESULT:'success',RISK:'D',DEEP:'true',ANALYZED_SHA:'a'.repeat(40),GITHUB_SHA:'a'.repeat(40),FULL_RESULT:'success',FAST_RESULT:'skipped',DEMO_RESULT:'success'};
const run=env=>spawnSync(process.execPath,['scripts/ci/check-result.mjs'],{env:{...process.env,...env},encoding:'utf8'}).status;
assert.equal(run(base),0);
for(const state of ['cancelled','failure','skipped','']){
 assert.notEqual(run({...base,FULL_RESULT:state}),0);
 assert.notEqual(run({...base,DEMO_RESULT:state}),0);
 assert.notEqual(run({...base,CLASSIFY_RESULT:state}),0);
}
assert.notEqual(run({...base,ANALYZED_SHA:'b'.repeat(40)}),0);
assert.notEqual(run({...base,RISK:''}),0);
assert.equal(run({...base,RISK:'A',DEEP:'false',FULL_RESULT:'skipped',FAST_RESULT:'success',DEMO_RESULT:'skipped'}),0);
console.log('Risk policy: classification, renames, missing/cancelled jobs, integration and SHA PASS');

// Coordination tests use isolated synthetic child fixtures, never a database.
// The full API/Auth/Storage/RLS seed remains a separate required CI gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { seedCoordination, preparedSeeds } from './ci-demo/seed-coordination.mjs';
import { assessSeedEquivalence } from './ci-demo/seed-proof.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'arandu-seed-coordination-test-'));
const moduleUrl=pathToFileURL(path.resolve('scripts/ci-demo/seed-coordination.mjs')).href;
const runner=path.resolve('scripts/ci-demo/seed-pool.mjs');
const contract=JSON.parse(fs.readFileSync('ops/ci/acceleration-v7/seed-sanity-contract.json','utf8'));
const proof=()=>({classification:'synthetic_seed_timing_no_payload',result:'PASS',sanity:{checks:contract.checks,passed:contract.checks,check_names_sha256:contract.check_names_sha256},phases:[{name:'sanity',result:'PASS'}]});
const local={ARANDU_ENV:'demo',ARANDU_DEMO_CONFIRM:'local',SUPABASE_URL:'http://127.0.0.1:8443',ARANDU_DEMO_APP_URL:'http://127.0.0.1:4443',CRON_SECRET:'synthetic-test-only',CI_DEMO_SEED_COORDINATION_DIR:root};
try {
 fs.chmodSync(root,0o700);fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({version:1,workspaces:4}));
 const plain=seedCoordination({});assert.equal(await plain.beforeCron(),true);assert.equal(plain.cronPasses,1);
 for(const env of [{...local,SUPABASE_URL:'https://remote.example.com'}, {...local,ARANDU_DEMO_CONFIRM:'hosted'}, {...local,VERCEL_ENV:'preview'}, {...local,CRON_SECRET:''}])assert.throws(()=>seedCoordination(env),/requires_local_demo/);
 fs.chmodSync(root,0o755);assert.throws(()=>seedCoordination(local),/directory_invalid/);fs.chmodSync(root,0o700);
 const baseline=seedCoordination(local,{timeoutMs:1000,pollMs:1});await baseline.initialized();assert(fs.existsSync(path.join(root,'baseline.initialized')));
 let baselineReleased=false,visitorReleased=false;
 const waitBaseline=baseline.beforeCron().then(run=>{baselineReleased=true;assert.equal(run,true);});
 const visitor=seedCoordination({...local,ARANDU_DEMO_WORKSPACE:'0123456789'},{timeoutMs:1000,pollMs:1});
 const waitVisitor=visitor.beforeCron().then(run=>{visitorReleased=true;assert.equal(run,false);});
 await new Promise(resolve=>setTimeout(resolve,10));assert(!baselineReleased&&!visitorReleased);
 assert.deepEqual(preparedSeeds(root),{baseline:true,workspaces:1});
 fs.writeFileSync(path.join(root,'cron.permit'),'ready');await waitBaseline;assert(!visitorReleased);baseline.afterCron();await waitVisitor;
 assert.equal(baseline.cronPasses,5);assert.equal(visitor.cronPasses,0);
 fs.writeFileSync(path.join(root,'unexpected.prepared'),'x');assert.throws(()=>preparedSeeds(root),/unexpected_seed_participant/);fs.unlinkSync(path.join(root,'unexpected.prepared'));
 await assert.rejects(visitor.beforeCron(),/EEXIST/); // No duplicate participant registration.
 const profiles=['baseline-reset','0000000001-seed','0000000002-seed','0000000003-seed','0000000004-seed'].map(name=>({name:`seed-${name}.json`,report:proof()}));
 assert.equal(assessSeedEquivalence(profiles,contract).result,'PASS');
 assert.equal(assessSeedEquivalence(profiles.slice(1),contract).result,'FAIL');
 const missing=structuredClone(profiles);missing[2].report.sanity.checks--;assert.equal(assessSeedEquivalence(missing,contract).result,'FAIL');
 const changed=structuredClone(profiles);changed[2].report.sanity.check_names_sha256='f'.repeat(64);assert.equal(assessSeedEquivalence(changed,contract).result,'FAIL');
 const failed=structuredClone(profiles);failed[2].report.result='FAIL';assert.equal(assessSeedEquivalence(failed,contract).result,'FAIL');

 for(const fail of [false,true]) {
  const fixture=path.join(root,fail?'failure':'success');
  for(const d of ['scripts/demo','scripts/pilot-local/.state'])fs.mkdirSync(path.join(fixture,d),{recursive:true});
  fs.writeFileSync(path.join(fixture,'scripts/demo/seed.mjs'),`import fs from 'node:fs';import path from 'node:path';import {seedCoordination} from ${JSON.stringify(moduleUrl)};
const c=seedCoordination();await c.initialized();
if(${fail})process.exit(2);
if(await c.beforeCron()){fs.writeFileSync(path.join(process.env.CI_DEMO_SEED_COORDINATION_DIR,'actual-test-cron-count'),String(c.cronPasses));c.afterCron();}
fs.writeFileSync(path.join(process.env.ARANDU_SEED_PROFILE_DIR,'seed-baseline-reset.json'),JSON.stringify(${JSON.stringify(proof())}));
`);
  fs.writeFileSync(path.join(fixture,'scripts/demo/workspaces.mjs'),`import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {seedCoordination} from ${JSON.stringify(moduleUrl)};
const directory=process.env.CI_DEMO_SEED_COORDINATION_DIR;assert(fs.existsSync(path.join(directory,'baseline.initialized')));
assert.deepEqual(process.argv.slice(2),['provision','--count=4','--concurrency=4']);
await Promise.all(['0000000001','0000000002','0000000003','0000000004'].map(slug=>seedCoordination({...process.env,ARANDU_DEMO_WORKSPACE:slug}).beforeCron()));
assert.equal(fs.readFileSync(path.join(directory,'actual-test-cron-count'),'utf8'),'5');
for(const slug of ['0000000001','0000000002','0000000003','0000000004'])fs.writeFileSync(path.join(process.env.ARANDU_SEED_PROFILE_DIR,'seed-'+slug+'-seed.json'),JSON.stringify(${JSON.stringify(proof())}));
`);
  const env={...process.env,...local,ARANDU_SEED_PROFILE_DIR:path.join(fixture,'profiles')};delete env.CI_DEMO_SEED_COORDINATION_DIR;
  for(const key of ['VERCEL_ENV','VERCEL_URL','SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD','DEMO_SUPABASE_REFS','ARANDU_DEMO_WORKSPACE'])delete env[key];
  const result=spawnSync(process.execPath,[runner],{cwd:fixture,env,encoding:'utf8',timeout:15000});
  assert.equal(result.status,fail?1:0,result.stdout+result.stderr);
  assert.match(result.stdout+result.stderr,fail?/PARALLEL_OFFICIAL_SEEDS_FAILED/:/PARALLEL_OFFICIAL_SEEDS_PASS/);
  assert.deepEqual(fs.readdirSync(path.join(fixture,'scripts/pilot-local/.state')),[],'Coordination state was not cleaned');
 }
 console.log('Seed coordination: reset boundary, five participants, serialized cron, hosted rejection, private state, child failure and cleanup PASS (synthetic fixtures only).');
} finally {fs.rmSync(root,{recursive:true,force:true});}

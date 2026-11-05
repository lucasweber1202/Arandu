// Overlap independent per-persona quota windows; never reset/bypass a limiter.
// Reset finishes before visitors start; global maintenance runs after all five
// business stories finish. Every seed still runs the full canonical sanity.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { assertLocalEnv } from './assert-local.mjs';
import { preparedSeeds, seedCoordination } from './seed-coordination.mjs';
import { verifySeedProfiles } from './seed-proof.mjs';

assertLocalEnv(process.env,'parallel-official-seeds');
if(process.argv.length!==2||process.env.ARANDU_DEMO_WORKSPACE||process.env.CI_DEMO_SEED_COORDINATION_DIR||!process.env.ARANDU_SEED_PROFILE_DIR)throw Error('invalid_seed_pool_invocation');
const contract=JSON.parse(fs.readFileSync(new URL('../../ops/ci/acceleration-v7/seed-sanity-contract.json',import.meta.url),'utf8'));
fs.mkdirSync(process.env.ARANDU_SEED_PROFILE_DIR,{recursive:true});
if(fs.readdirSync(process.env.ARANDU_SEED_PROFILE_DIR).some(name=>/^seed-.*\.json$/.test(name)))throw Error('seed_profiles_must_start_empty');
const directory=fs.mkdtempSync(path.resolve('scripts/pilot-local/.state/seed-coordination-'));
fs.chmodSync(directory,0o700);
fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify({version:1,workspaces:4}),{mode:0o600});
const env={...process.env,CI_DEMO_SEED_COORDINATION_DIR:directory};
seedCoordination(env); // Validate all targets and private state before spawning.
const children=[],start=performance.now();let failed=false;
function launch(args,label) {
  const child=spawn(process.execPath,args,{env,stdio:'inherit',detached:true});
  const entry={child,label,finished:false,status:null};children.push(entry);
  entry.done=new Promise(resolve=>{
    child.once('error',()=>{failed=true;entry.finished=true;entry.status=-1;resolve();});
    child.once('close',status=>{entry.finished=true;entry.status=status;failed ||= status!==0;resolve();});
  });
  return entry;
}
function abort() {
  if(!fs.existsSync(path.join(directory,'aborted')))fs.writeFileSync(path.join(directory,'aborted'),'aborted\n',{mode:0o600});
  for(const entry of children)if(Number.isInteger(entry.child.pid))try{process.kill(-entry.child.pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}
}
const onSignal=()=>{failed=true;abort();};
process.on('SIGTERM',onSignal);process.on('SIGINT',onSignal);
async function waitFor(test) {
  while(!test()) {
    if(failed||performance.now()-start>24*60*1000)throw Error('parallel_seed_failed_or_timed_out');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(failed)throw Error('parallel_seed_failed');
}
try {
  const baseline=launch(['scripts/demo/seed.mjs','--reset'],'baseline');
  await waitFor(()=>fs.existsSync(path.join(directory,'baseline.initialized')));
  const pool=launch(['scripts/demo/workspaces.mjs','provision','--count=4','--concurrency=4'],'pool');
  await waitFor(()=>{const p=preparedSeeds(directory);return p.baseline&&p.workspaces===4;});
  fs.writeFileSync(path.join(directory,'cron.permit'),'ready\n',{flag:'wx',mode:0o600});
  await waitFor(()=>baseline.finished&&pool.finished);
  await Promise.all(children.map(entry=>entry.done));
  if(!fs.existsSync(path.join(directory,'cron.complete')))throw Error('canonical_cron_missing');
  const semantic=verifySeedProfiles(process.env.ARANDU_SEED_PROFILE_DIR,contract);
  console.log('SEED_SEMANTIC_EQUIVALENCE '+JSON.stringify(semantic));
  if(semantic.result!=='PASS')throw Error('seed_semantic_equivalence_failed');
  console.log('PARALLEL_OFFICIAL_SEEDS_PASS '+JSON.stringify({baseline:1,workspaces:4,cron_calls:5,seconds:(performance.now()-start)/1000,
    invariants:['official_api_seed','real_persona_jwt','unchanged_quotas','retry_after_obeyed','reset_before_visitors','global_cron_after_business','full_sanity_per_seed']}));
} catch(error) {
  abort();
  await Promise.race([Promise.all(children.map(entry=>entry.done)),new Promise(resolve=>setTimeout(resolve,5000))]);
  // Own process groups only: an interrupted pool must not leave seed children
  // writing while the workflow tears down its isolated stack.
  for(const entry of children)if(Number.isInteger(entry.child.pid))try{process.kill(-entry.child.pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')throw e;}
  console.error('PARALLEL_OFFICIAL_SEEDS_FAILED');process.exitCode=1;
} finally {
  process.off('SIGTERM',onSignal);process.off('SIGINT',onSignal);
  fs.rmSync(directory,{recursive:true,force:true});
}

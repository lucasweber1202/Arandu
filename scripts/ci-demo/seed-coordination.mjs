// Coordination only for five real seeds on the isolated CI runner.
// Business writes, JWTs, RLS, quotas and Retry-After remain in the official seed.
import fs from 'node:fs';
import path from 'node:path';
import { localViolations } from './assert-local.mjs';

export function seedCoordination(env=process.env, {timeoutMs=22*60*1000,pollMs=100}={}) {
  const directory=env.CI_DEMO_SEED_COORDINATION_DIR;
  if (!directory) return { initialized:async()=>{}, beforeCron:async()=>true, afterCron:()=>{}, cronPasses:1 };
  if (env.ARANDU_ENV!=='demo'||env.ARANDU_DEMO_CONFIRM!=='local'||localViolations(env).length
    || !env.SUPABASE_URL||!env.ARANDU_DEMO_APP_URL||!env.CRON_SECRET||!path.isAbsolute(directory)) throw Error('seed_coordination_requires_local_demo');
  const stat=fs.lstatSync(directory);
  if (!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.uid!==process.getuid()) throw Error('seed_coordination_directory_invalid');
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
  if (manifest.version!==1||manifest.workspaces!==4) throw Error('seed_coordination_manifest_invalid');
  const actor=env.ARANDU_DEMO_WORKSPACE||'baseline';
  if (actor!=='baseline'&&!/^[a-f0-9]{10}$/.test(actor)) throw Error('seed_coordination_actor_invalid');
  const signal=name=>fs.writeFileSync(path.join(directory,name),'ready\n',{flag:'wx',mode:0o600});
  const wait=async name=>{
    const deadline=Date.now()+timeoutMs;
    while(!fs.existsSync(path.join(directory,name))) {
      if(fs.existsSync(path.join(directory,'aborted'))) throw Error('seed_coordination_aborted');
      if(Date.now()>=deadline)throw Error('seed_coordination_timeout');
      await new Promise(resolve=>setTimeout(resolve,pollMs));
    }
  };
  return {
    initialized:async()=>{if(actor==='baseline')signal('baseline.initialized');},
    beforeCron:async()=>{
      signal(`${actor}.prepared`);
      await wait(actor==='baseline'?'cron.permit':'cron.complete');
      return actor==='baseline';
    },
    afterCron:()=>{if(actor==='baseline')signal('cron.complete');},
    // Preserve the five actual cron calls, serialized after all business
    // objects exist. Repeated maintenance still exercises idempotency.
    cronPasses:actor==='baseline'?5:0
  };
}

export function preparedSeeds(directory) {
  const names=fs.readdirSync(directory).filter(name=>name.endsWith('.prepared'));
  if(names.some(name=>! /^(?:baseline|[a-f0-9]{10})\.prepared$/.test(name))||names.length>5)throw Error('unexpected_seed_participant');
  return {baseline:names.includes('baseline.prepared'),workspaces:names.filter(name=>name!=='baseline.prepared').length};
}

#!/usr/bin/env node
// Cheap pre-publication checks, never merge/release authorization or deep CI.
import { spawnSync,execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { preflight } from './ci/preflight.mjs';
const stages=[],start=performance.now();
const git=(...args)=>{try{return execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}catch{throw Error('git_'+args[0].replaceAll('-','_')+'_failed');}};
function stage(name,command,args,env=process.env) {
 const began=performance.now();
 const r=spawnSync(command,args,{env,stdio:'inherit'});
 stages.push({name,seconds:(performance.now()-began)/1000,result:r.status===0&&!r.error?'PASS':'FAIL'});
 if(r.error||r.status!==0)throw Error(name);
}
let sha=null,risk=null;
try {
 if(process.argv.length>2)throw Error('unknown_arguments');
 sha=git('rev-parse','HEAD');
 const remote=git('ls-remote','--heads','origin','refs/heads/main').split(/\s+/)[0];
 const base=git('rev-parse','origin/main');
 if(!/^[a-f0-9]{40}$/.test(remote)||remote!==base)throw Error('fetch_main_before_prepublish');
 try {git('merge-base','--is-ancestor',base,sha);}catch{throw Error('main_not_ancestor');}
 if(git('status','--porcelain','--untracked-files=normal'))throw Error('commit_checkpoint_before_prepublish');
 const plan=preflight();risk=plan.risk;
 console.log(JSON.stringify(plan));
 console.log(JSON.stringify({tool:'arandu-ci-prepublish',sha,base,risk,changed_files:plan.reasons.map(r=>r.path),scope:'CHEAP_LOCAL_CHECKS_ONLY',ci_required:true,deep_ci_required:risk==='D'}));
 // Match the public site fixture inherited by source/deploy CI jobs. Local
 // integration fixtures must override it themselves, never relax host guards.
 stage('source_contracts',process.execPath,['scripts/run-hermetic.mjs','npm','run','check:all'],{...process.env,ARANDU_SITE_URL:'https://arandu.example.com'});
 stage('regular_build','npm',['run','build']);stage('regular_budget','npm',['run','check:build-size']);
 stage('regular_assets','npm',['run','check:dist-assets']);
 stage('demo_build','npm',['run','build'],{...process.env,ARANDU_ENV:'',VERCEL_ENV:'preview',ARANDU_DEMO_MODE:'true'});
 stage('demo_budget','npm',['run','check:build-size']);stage('demo_assets','npm',['run','check:dist-assets']);
 const latest=git('ls-remote','--heads','origin','refs/heads/main').split(/\s+/)[0];
 if(latest!==base||git('rev-parse','HEAD')!==sha||git('status','--porcelain','--untracked-files=normal'))throw Error('source_changed_during_prepublish');
 console.log(JSON.stringify({tool:'arandu-ci-prepublish',sha,risk,result:'LOCAL_PREFLIGHT_PASS_CI_STILL_REQUIRED',seconds:(performance.now()-start)/1000,stages,merge_authorized:false}));
} catch(error) {
 console.error(JSON.stringify({tool:'arandu-ci-prepublish',sha,risk,result:'BLOCKED',failed_stage:/^[a-z_]+$/.test(error.message)?error.message:'configuration_or_git',seconds:(performance.now()-start)/1000,stages,merge_authorized:false}));process.exitCode=1;
}
